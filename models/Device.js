const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
    deviceId: {
        type: String,
        required: true,
        unique: true
    },
    deviceType: {
        type: String,
        required: true
    },
    serviceChannelTagetId: {
        type: String,
        default: ''
    },
    qServer: {
        type: String,
        default: () => process.env.DEFAULT_QID || '192.168.7.101'
    },
    isOnline: {
        type: Boolean,
        default: false
    },
    lastSeen: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Device', deviceSchema);
