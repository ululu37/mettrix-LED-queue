const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const Device = require('./models/Device');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/configlogger')
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.log('MongoDB connection error:', err));

// Map socket id to device id
const onlineSockets = new Map();

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  // 1. เปิด connection มาถามหา id type อุปกรก่อน
  socket.emit('request_info', { message: 'Tell me your id and type' });

  // Client responds to request_info with register event
  socket.on('register', async (data) => {
    let { id, type } = data;

    if (type === 'serviceChannelLoger') {
      let device;

      // ถ้าไม่มี id ให้ระบบเจนให้
      if (!id) {
        // Generate short and readable ID
        id = `C-${uuidv4().substring(0, 6).toUpperCase()}`;
        device = new Device({ deviceId: id, deviceType: type });
        await device.save();

        // Push event init_id
        socket.emit('init_id', { id, type });
        console.log(`Generated new ID ${id} for socket ${socket.id}`);
      } else {
        device = await Device.findOne({ deviceId: id });
        if (!device) {
          device = new Device({ deviceId: id, deviceType: type });
          await device.save();
        }
      }

      // Update online status
      device.isOnline = true;
      device.lastSeen = Date.now();
      await device.save();

      onlineSockets.set(socket.id, id);
      socket.join(id); // Join room based on device ID

      // Send the current config automatically upon registering
      socket.emit('config_update', {
        serviceChannelTagetId: device.serviceChannelTagetId,
        qServer: device.qServer
      });

      io.emit('ui_update'); // Tell UI to refresh
      console.log(`Device ${id} registered and marked online.`);
    }
  });

  socket.on('disconnect', async () => {
    const deviceId = onlineSockets.get(socket.id);
    if (deviceId) {
      await Device.findOneAndUpdate({ deviceId }, { isOnline: false, lastSeen: Date.now() });
      onlineSockets.delete(socket.id);
      io.emit('ui_update');
      console.log(`Device ${deviceId} disconnected.`);
    }
  });
});

// APIs for the beautiful UI and Postman
app.get('/api/devices', async (req, res) => {
  try {
    const devices = await Device.find().sort({ isOnline: -1, lastSeen: -1 });
    const onlineCount = devices.filter(d => d.isOnline).length;
    res.json({ total: devices.length, onlineCount, devices });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. save config push config ไปที่ deviceID นั้น
app.post('/api/config/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  const { serviceChannelTagetId, qServer } = req.body;

  try {
    let device = await Device.findOne({ deviceId });
    if (!device) return res.status(404).json({ error: 'Device not found' });

    // Update config using provided values (or keeping existing if undefined/null)
    if (serviceChannelTagetId !== undefined) device.serviceChannelTagetId = serviceChannelTagetId;
    if (qServer !== undefined) device.qServer = qServer;

    await device.save();

    // Push the new config to the target device by finding its specific socket
    let isDeviceOnline = false;
    for (let [socketId, id] of onlineSockets.entries()) {
      if (id === deviceId) {
        isDeviceOnline = true;

        // ส่งตรงไปที่ socketId นั้นๆ เลย เพื่อความชัวร์ที่สุด
        io.to(socketId).emit('config_update', {
          deviceId: device.deviceId,
          serviceChannelTagetId: device.serviceChannelTagetId,
          qServer: device.qServer
        });

        // ส่ง Event เเจ้งเตือนเพิ่มเติม (เผื่อ client ดักรอ)
        io.to(socketId).emit('notification', {
          message: 'Config has been updated by the server!',
          timestamp: new Date()
        });
      }
    }

    io.emit('ui_update'); // Tell UI to update display data
    res.json({
      message: 'Config updated successfully',
      device,
      pushedToDevice: isDeviceOnline
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. ปลั๊กอินสร้าง API ลบอุปกรณ์ (Remove Device)
app.delete('/api/devices/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;

    const device = await Device.findOneAndDelete({ deviceId });
    if (!device) return res.status(404).json({ error: 'Device not found' });

    // เตะ Device ออกจากการเชื่อมต่อด้วย (ถ้าออนไลน์อยู่)
    for (let [socketId, id] of onlineSockets.entries()) {
      if (id === deviceId) {
        const targetSocket = io.sockets.sockets.get(socketId);
        if (targetSocket) {
          targetSocket.emit('notification', { message: 'Your device was removed from the server.' });
          targetSocket.disconnect(true);
        }
        onlineSockets.delete(socketId);
      }
    }

    io.emit('ui_update'); // ประกาศให้ UI รีเฟรช
    res.json({ message: 'Device removed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Config server listening on port ${PORT}`);
});
