const socket = io();

// UI Elements
const totalCountEl = document.getElementById('totalCount');
const onlineCountEl = document.getElementById('onlineCount');
const devicesGridEl = document.getElementById('devicesGrid');
const refreshBtn = document.getElementById('refreshBtn');
const toastEl = document.getElementById('toast');
const toastMessageEl = document.getElementById('toastMessage');

// Initial Load
let devices = [];

// Socket Events to refresh UI dynamically
socket.on('ui_update', () => {
    fetchDevices();
});

// Fetch devices initially
document.addEventListener('DOMContentLoaded', fetchDevices);

refreshBtn.addEventListener('click', () => {
    refreshBtn.querySelector('i').classList.add('fa-spin');
    fetchDevices().then(() => {
        setTimeout(() => {
            refreshBtn.querySelector('i').classList.remove('fa-spin');
        }, 500);
    });
});

async function fetchDevices() {
    try {
        const response = await fetch('/api/devices');
        const data = await response.json();

        // Update stats
        totalCountEl.textContent = data.total;
        onlineCountEl.textContent = data.onlineCount;

        devices = data.devices;
        renderDevices();
    } catch (error) {
        console.error('Error fetching devices:', error);
        showToast('Failed to load devices!', 'error');
    }
}

function renderDevices() {
    if (devices.length === 0) {
        devicesGridEl.innerHTML = `
            <div class="loading-state" style="grid-column: 1 / -1;">
                <i class="fa-solid fa-server" style="font-size: 3rem; color: var(--text-muted); margin-bottom: 1rem; opacity: 0.5;"></i>
                <p>No devices connected yet.</p>
            </div>
        `;
        return;
    }

    devicesGridEl.innerHTML = devices.map(device => `
        <div class="card ${device.isOnline ? 'online' : 'offline'}" id="device-${device.deviceId}">
            <div class="card-status-bar"></div>
            <div class="card-header">
                <div class="device-title">
                    <div class="device-id">
                        <i class="fa-solid fa-microchip"></i>
                        ${device.deviceId}
                    </div>
                    <div class="device-type">${device.deviceType}</div>
                </div>
                <div class="status-badge ${device.isOnline ? 'online' : 'offline'}">
                    ${device.isOnline ? 'Online' : 'Offline'}
                </div>
                <button type="button" class="btn btn-icon delete-btn" onclick="removeDevice('${device.deviceId}')" title="Delete Device" style="background: transparent; border: none; color: var(--danger); cursor: pointer; padding: 0.5rem; font-size: 1.1rem; margin-left: auto;">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
            <div class="card-body">
                <form id="form-${device.deviceId}" onsubmit="saveConfig(event, '${device.deviceId}')">
                    <div class="form-group">
                        <label>Target Service Channel ID</label>
                        <div class="input-with-icon">
                            <i class="fa-solid fa-bullseye"></i>
                            <input type="text" 
                                id="target-${device.deviceId}" 
                                class="form-control" 
                                placeholder="e.g. Channel_A" 
                                value="${device.serviceChannelTagetId || ''}">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Queue Server IP</label>
                        <div class="input-with-icon">
                            <i class="fa-solid fa-network-wired"></i>
                            <input type="text" 
                                id="qserver-${device.deviceId}" 
                                class="form-control" 
                                placeholder="192.168.7.101" 
                                value="${device.qServer || '192.168.7.101'}">
                        </div>
                    </div>
                    <button type="submit" class="btn btn-primary w-full" ${device.isOnline ? '' : 'disabled style="opacity:0.5; cursor:not-allowed;"'}>
                        <i class="fa-solid fa-cloud-arrow-up"></i>
                        Save & Push Config
                    </button>
                </form>
            </div>
            <div class="card-footer">
                <div class="last-seen">
                    <i class="fa-regular fa-clock"></i> 
                    Last seen: ${device.lastSeen ? new Date(device.lastSeen).toLocaleString() : 'Never'}
                </div>
            </div>
        </div>
    `).join('');
}

async function saveConfig(event, deviceId) {
    event.preventDefault();

    const targetEl = document.getElementById(`target-${deviceId}`);
    const qserverEl = document.getElementById(`qserver-${deviceId}`);

    const serviceChannelTagetId = targetEl.value.trim();
    const qServer = qserverEl.value.trim();

    const btn = event.target.querySelector('button');
    const originalContent = btn.innerHTML;

    // Loading State
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Pushing...';
    btn.disabled = true;

    try {
        const response = await fetch(`/api/config/${deviceId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ serviceChannelTagetId, qServer })
        });

        if (response.ok) {
            showToast(`Config pushed to ${deviceId} successfully!`, 'success');
        } else {
            const err = await response.json();
            showToast(`Error: ${err.error}`, 'error');
        }
    } catch (error) {
        showToast('Network error failed to push config', 'error');
    } finally {
        // Reset state
        btn.innerHTML = originalContent;
        btn.disabled = false;
        fetchDevices(); // Refresh list to update time and state smoothly
    }
}

async function removeDevice(deviceId) {
    if (!confirm(`Are you sure you want to completely remove device ${deviceId}?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/devices/${deviceId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast(`Device ${deviceId} removed!`, 'success');
            fetchDevices();
        } else {
            const err = await response.json();
            showToast(`Error: ${err.error}`, 'error');
        }
    } catch (error) {
        showToast('Network error failed to remove device', 'error');
    }
}

function showToast(message, type = 'success') {
    toastMessageEl.textContent = message;
    toastEl.style.borderColor = type === 'success' ? 'var(--success)' : 'var(--danger)';
    toastEl.style.color = 'var(--text-main)'; // text is always white

    toastEl.querySelector('i').className = type === 'success'
        ? 'fa-solid fa-circle-check'
        : 'fa-solid fa-circle-exclamation';

    toastEl.querySelector('i').style.color = type === 'success'
        ? 'var(--success)'
        : 'var(--danger)';

    toastEl.classList.add('show');

    setTimeout(() => {
        toastEl.classList.remove('show');
    }, 3000);
}
