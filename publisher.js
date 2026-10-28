const mqtt = require('mqtt');

// MQTT broker（公共免费 emqx 测试服务器，实验专用）
const brokerUrl = 'mqtt://broker.emqx.io:1883';
const topic = '/iot/sensor/temphumi';

// 连接配置
const options = {
  clientId: 'pub_' + Math.random().toString(16).slice(2, 10),
  clean: true
};

const client = mqtt.connect(brokerUrl, options);

// ============== 可视化数据缓冲区（新增） ==============
const MAX_BUFFER = 60;
const dataBuffer = [];

// =====================================================

client.on('connect', function () {
  console.log('✅ MQTT 连接成功，开始定时发布温湿度数据');
  console.log(`发布主题：${topic}`);

  // 每隔1秒发一组数据
  setInterval(() => {
    // 模拟温湿度：温度 20~30℃，湿度 40~70%
    const temp = parseFloat((20 + Math.random() * 10).toFixed(1));
    const humi = parseFloat((40 + Math.random() * 30).toFixed(1));
    const data = {
      temperature: temp,
      humidity: humi,
      time: new Date().toLocaleTimeString()
    };

    // ========== 新增：同时存入环形缓冲区 ==========
    dataBuffer.push(data);
    if (dataBuffer.length > MAX_BUFFER) dataBuffer.shift();

    const payload = JSON.stringify(data);

    client.publish(topic, payload, { qos: 0 }, (err) => {
      if (!err) {
        console.log(`📤 发布：${payload}`);
      } else {
        console.error('❌ 发布失败：', err);
      }
    });
  }, 1000);
});

client.on('error', (err) => {
  console.error('MQTT 连接错误：', err);
  client.end();
});

// ============== 导出给 Express server.js 使用（新增） ==============
module.exports = {
  MAX_BUFFER,
  getCurrent: () => dataBuffer.length > 0 ? dataBuffer[dataBuffer.length - 1] : null,
  getHistory: (n = MAX_BUFFER) => dataBuffer.slice(-Math.min(n, dataBuffer.length)),
  reset: () => { dataBuffer.length = 0; }
};
