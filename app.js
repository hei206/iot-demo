/**
 * 物联网传感器数据可视化 —— 实时数据 + Chart.js
 * 数据来源：本地模拟（可替换为 MQTT / WebSocket / HTTP API）
 */

(function () {
    'use strict';

    // ======== 配置 ========
    const MAX_POINTS = 30; // 图表保留的最大数据点
    const DEFAULT_INTERVAL = 2000; // 默认刷新间隔（毫秒）

    // ======== 状态 ========
    let timerId = null;
    let running = false;
    let intervalMs = DEFAULT_INTERVAL;

    // 数据缓冲
    const labels = []; // 时间戳
    const tempData = [];
    const humiData = [];

    // 极值统计
    let tempMax = -Infinity;
    let tempMin = Infinity;
    let humiMax = -Infinity;
    let humiMin = Infinity;

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
                    grid: { drawOnChartArea: false }, // 右侧轴不画网格
                },
            },
        },
    });

    // ======== 模拟传感器数据 ========
    // 基于"正弦基线 + 随机游走"，更贴近真实环境传感器的变化曲线
    let tempBaseline = 24; // 温度基线
    let humiBaseline = 55; // 湿度基线
    let tickCount = 0;

    function readSensor() {
        tickCount++;
        const noise = () => (Math.random() - 0.5) * 2; // -1 ~ 1

        // 温度：基线 + 日内正弦趋势（周期 ~2 分钟，模拟演示用）+ 小噪声
        tempBaseline += noise() * 0.15; // 慢慢漂移
        tempBaseline = clamp(tempBaseline, 15, 35);
        const temp = +(
            tempBaseline +
            Math.sin(tickCount * 0.15) * 2.5 +
            noise() * 0.4
        ).toFixed(1);

        // 湿度：类似逻辑
        humiBaseline += noise() * 0.3;
        humiBaseline = clamp(humiBaseline, 30, 80);
        const humi = +(
            humiBaseline +
            Math.cos(tickCount * 0.12) * 6 +
            noise() * 0.8
        ).toFixed(1);

        return { temp, humi };
    }

    function clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    // ======== 刷新一次 ========
    function tick() {
        const { temp, humi } = readSensor();
        const now = new Date();
        const timeStr = now.toLocaleTimeString('zh-CN', { hour12: false });

        // 维护滑动窗口
        labels.push(timeStr);
        tempData.push(temp);
        humiData.push(humi);

        if (labels.length > MAX_POINTS) {
            labels.shift();
            tempData.shift();
            humiData.shift();
        }

        // 更新极值（只在满窗口内统计最新值）
        // 由于窗口滑动，极值重新计算更准确
        tempMax = Math.max(...tempData);
        tempMin = Math.min(...tempData);
        humiMax = Math.max(...humiData);
        humiMin = Math.min(...humiData);

        // 更新数值卡片
        document.getElementById('tempValue').textContent = temp;
        document.getElementById('humiValue').textContent = humi;
        document.getElementById('tempMax').textContent = tempMax.toFixed(1);
        document.getElementById('tempMin').textContent = tempMin.toFixed(1);
        document.getElementById('humiMax').textContent = humiMax.toFixed(1);
        document.getElementById('humiMin').textContent = humiMin.toFixed(1);

        // 更新图表（不传 duration 做平滑追加）
        chart.update('none');
    }

    // ======== 启停控制 ========
    function start() {
        if (running) return;
        running = true;
        timerId = setInterval(tick, intervalMs);
        document.getElementById('statusText').textContent = '采集中';
    }

    function stop() {
        if (!running) return;
        running = false;
        clearInterval(timerId);
        timerId = null;
        document.getElementById('statusText').textContent = '已暂停';
    }

    function clearAll() {
        stop();
        labels.length = 0;
        tempData.length = 0;
        humiData.length = 0;
        tempMax = -Infinity;
        tempMin = Infinity;
        humiMax = -Infinity;
        humiMin = Infinity;
        tickCount = 0;

        // 重置卡片显示
        ['tempValue', 'humiValue'].forEach((id) => {
            document.getElementById(id).textContent = '--';
        });
        ['tempMax', 'tempMin', 'humiMax', 'humiMin'].forEach((id) => {
            document.getElementById(id).textContent = '--';
        });

        chart.update();
        document.getElementById('statusText').textContent = '未开始';
    }

    function applyInterval() {
        const select = document.getElementById('intervalSelect');
        intervalMs = parseInt(select.value, 10);
        if (running) {
            clearInterval(timerId);
            timerId = setInterval(tick, intervalMs);
        }
    }

    // ======== 绑定按钮 ========
    document.getElementById('btnStart').addEventListener('click', start);
    document.getElementById('btnStop').addEventListener('click', stop);
    document.getElementById('btnClear').addEventListener('click', clearAll);
    document.getElementById('intervalSelect').addEventListener('change', applyInterval);

    // ======== 页面加载后自动采集 ========
    window.addEventListener('load', () => {
        // 先填入 3 个初始点，图表不至于空白
        for (let i = 0; i < 3; i++) tick();
        start();
    });
})();
