/**
 * 物联网传感器数据可视化 —— Express REST 轮询
 * 数据源：Express /api/current + /api/history（publisher.js 生成的数据）
 */

(function () {
    'use strict';

    const MAX_POINTS = 60; // 图表最多保留 60 个点（和 publisher 缓冲区一致）
    const POLL_INTERVAL = 1000; // 每秒轮询一次（publisher 也是 1 秒一跳）

    // 数据缓冲（前端自己维护用于图表渲染和极值计算）
    const labels = [];       // 时间戳
    const tempData = [];     // 温度
    const humiData = [];     // 湿度

    let lastTime = null;     // 上次收到的 time 字段，用于去重
    let pollingTimer = null;
    let isConnected = false;

    // ======== 初始化 Chart ========
    const ctx = document.getElementById('sensorChart').getContext('2d');
    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '温度 (°C)',
                    data: tempData,
                    borderColor: '#ff9a56',
                    backgroundColor: 'rgba(255, 154, 86, 0.15)',
                    borderWidth: 2.5,
                    tension: 0.35,
                    fill: true,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    yAxisID: 'yTemp',
                },
                {
                    label: '湿度 (%)',
                    data: humiData,
                    borderColor: '#4facfe',
                    backgroundColor: 'rgba(79, 172, 254, 0.15)',
                    borderWidth: 2.5,
                    tension: 0.35,
                    fill: true,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    yAxisID: 'yHumi',
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 400 },
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#e6e6e6',
                        font: { size: 13 },
                        usePointStyle: true,
                        pointStyle: 'circle',
                    },
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 32, 39, 0.95)',
                    borderColor: 'rgba(255,255,255,0.2)',
                    borderWidth: 1,
                    titleColor: '#ffffff',
                    bodyColor: '#e6e6e6',
                },
            },
            scales: {
                x: {
                    ticks: { color: '#9fb3c8', maxRotation: 0, autoSkip: true },
                    grid: { color: 'rgba(255,255,255,0.08)' },
                },
                yTemp: {
                    type: 'linear',
                    position: 'left',
                    title: {
                        display: true,
                        text: '温度 (°C)',
                        color: '#ff9a56',
                    },
                    ticks: { color: '#ff9a56' },
                    grid: { color: 'rgba(255,255,255,0.08)' },
                },
                yHumi: {
                    type: 'linear',
                    position: 'right',
                    min: 0,
                    max: 100,
                    title: {
                        display: true,
                        text: '湿度 (%)',
                        color: '#4facfe',
                    },
                    ticks: { color: '#4facfe' },
                    grid: { drawOnChartArea: false },
                },
            },
        },
    });

    // ======== DOM 更新 ========

    function updateCards(temp, humi) {
        document.getElementById('tempValue').textContent = temp;
        document.getElementById('humiValue').textContent = humi;

        const tMax = Math.max(...tempData);
        const tMin = Math.min(...tempData);
        const hMax = Math.max(...humiData);
        const hMin = Math.min(...humiData);
        document.getElementById('tempMax').textContent =
            isFinite(tMax) ? tMax.toFixed(1) : '--';
        document.getElementById('tempMin').textContent =
            isFinite(tMin) ? tMin.toFixed(1) : '--';
        document.getElementById('humiMax').textContent =
            isFinite(hMax) ? hMax.toFixed(1) : '--';
        document.getElementById('humiMin').textContent =
            isFinite(hMin) ? hMin.toFixed(1) : '--';
    }

    function setStatus(text) {
        document.getElementById('statusText').textContent = text;
    }

    // ======== 数据入队 ========

    function pushPoint(data) {
        // 用 publisher 的字段名：temperature / humidity / time
        const t = data.temperature;
        const h = data.humidity;
        const timeStr = data.time;

        // 去重（同一秒内可能重复拉到同一条）
        if (lastTime === timeStr) return false;
        lastTime = timeStr;

        labels.push(timeStr);
        tempData.push(t);
        humiData.push(h);

        if (labels.length > MAX_POINTS) {
            labels.shift();
            tempData.shift();
            humiData.shift();
        }

        updateCards(t, h);
        chart.update('none');
        return true;
    }

    // ======== REST 轮询 ========

    async function fetchJSON(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
    }

    async function pollHistory() {
        try {
            const json = await fetchJSON('/api/history?n=60');
            if (json.ok && json.data && json.data.length > 0) {
                // 清空后批量灌入历史点
                labels.length = 0;
                tempData.length = 0;
                humiData.length = 0;
                lastTime = null;

                json.data.forEach((item) => pushPoint(item));
                chart.update();
                isConnected = true;
                setStatus('已连接');
            } else {
                setStatus('等待数据...');
            }
        } catch (err) {
            console.warn('加载历史失败：', err.message);
            setStatus('等待数据...（后端未启动？）');
        }
    }

    async function pollCurrent() {
        try {
            const json = await fetchJSON('/api/current');
            if (json.ok && json.data) {
                isConnected = true;
                setStatus('已连接');
                pushPoint(json.data);
            } else if (!json.ok) {
                setStatus('等待数据...');
            }
        } catch (err) {
            if (isConnected) {
                isConnected = false;
                setStatus('连接断开，重试中...');
            }
        }
    }

    async function resetAll() {
        try {
            await fetchJSON('/api/control?action=reset');
        } catch (_) { /* 忽略，本地也清 */ }

        labels.length = 0;
        tempData.length = 0;
        humiData.length = 0;
        lastTime = null;

        document.getElementById('tempValue').textContent = '--';
        document.getElementById('humiValue').textContent = '--';
        ['tempMax', 'tempMin', 'humiMax', 'humiMin'].forEach((id) => {
            document.getElementById(id).textContent = '--';
        });

        chart.update();
        setStatus('已清空');
    }

    // ======== 绑定按钮 ========
    document.getElementById('btnClear').addEventListener('click', resetAll);

    // ======== 启动 ========
    window.addEventListener('load', async () => {
        setStatus('连接中...');
        // 先拉一次历史，立即填充曲线
        await pollHistory();
        // 然后每秒轮询最新值
        pollingTimer = setInterval(pollCurrent, POLL_INTERVAL);
    });
})();
