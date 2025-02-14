// Import blocks functionality
window.addTapBlock = addTapBlock;
window.addLoopBlock = addLoopBlock;
window.addPrintBlock = addPrintBlock;

//save tasks
function saveTasks() {
    localStorage.setItem('tasks', JSON.stringify(window.state.tasks));
}

// Debug utility
const DEBUG = {
    LEVELS: {
        INFO: 'info',
        WARNING: 'warning',
        ERROR: 'error',
        SUCCESS: 'success',
        DEBUG: 'debug'
    },

    log(message, level = 'info', data = null) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;

        switch(level) {
            case 'error':
                console.error(logMessage, data || '');
                break;
            case 'warning':
                console.warn(logMessage, data || '');
                break;
            case 'success':
                console.log('%c' + logMessage, 'color: green', data || '');
                break;
            case 'debug':
                console.debug(logMessage, data || '');
                break;
            default:
                console.log(logMessage, data || '');
        }

        const consoleEl = document.getElementById('liveConsole');
        if (consoleEl) {
            const entry = document.createElement('div');
            entry.className = `console-entry ${level}`;
            entry.innerHTML = `
                <span class="timestamp">${timestamp}</span>
                <span class="message">${message}</span>
                ${data ? `<pre class="data">${JSON.stringify(data, null, 2)}</pre>` : ''}
            `;
            consoleEl.appendChild(entry);
            consoleEl.scrollTop = consoleEl.scrollHeight;
        }
    }
};

window.DEBUG = DEBUG;

// Device dimensions
const DEVICE_WIDTH = 320;
const DEVICE_HEIGHT = 720;

// Initial state setup
window.state = {
    currentTask: null,
    tasks: [],
    autoSaveTimeout: null,
    pendingBlockConfiguration: null,
    focusedBlock: null,
    lastTaskId: null,
    currentFrame: null,
    functionOverlaysEnabled: true,
    executingBlocks: new Set(),
    functions: []
};

// Task management functions
function createNewTask() {
    const task = {
        id: Date.now(),
        name: 'New Task',
        blocks: [],
        created: new Date().toISOString()
    };

    window.state.tasks.push(task);
    window.state.currentTask = task;

    // Clear current task display
    const currentTaskEl = document.getElementById('currentTask');
    if (currentTaskEl) {
        currentTaskEl.innerHTML = '<div class="nested-blocks"></div>';
    }

    // Reset task title
    const taskTitle = document.getElementById('taskTitle');
    if (taskTitle) {
        taskTitle.value = task.name;
    }

    DEBUG.log('New task created', 'success', task);
    saveTasks();
    renderTask(task);
    return task;
}

function renderTask(task) {
    const taskListEl = document.getElementById('taskList');
    if (!taskListEl) return;

    const taskEl = document.createElement('div');
    taskEl.className = 'task-list-item';
    taskEl.dataset.taskId = task.id;
    taskEl.innerHTML = `
        <span contenteditable="true">${task.name}</span>
        <button class="btn btn-sm btn-outline-danger delete-btn">Delete</button>
    `;

    taskEl.addEventListener('click', (e) => {
        if (!e.target.classList.contains('delete-btn')) {
            loadTask(task);

            // Highlight selected task
            document.querySelectorAll('.task-list-item').forEach(el => {
                el.classList.remove('active');
            });
            taskEl.classList.add('active');
        }
    });

    taskEl.querySelector('.delete-btn').addEventListener('click', () => {
        const index = window.state.tasks.indexOf(task);
        if (index > -1) {
            window.state.tasks.splice(index, 1);
            taskEl.remove();

            // Clear current task if it was the deleted one
            if (window.state.currentTask === task) {
                window.state.currentTask = null;
                const currentTask = document.getElementById('currentTask');
                if (currentTask) {
                    currentTask.innerHTML = '';
                }
            }
            saveTasks();
        }
    });

    taskListEl.appendChild(taskEl);
}

function loadTask(task) {
    window.state.currentTask = task;

    // Update task title
    const taskTitle = document.getElementById('taskTitle');
    if (taskTitle) {
        taskTitle.value = task.name;
        if (!taskTitle.hasEventListener) {
            taskTitle.hasEventListener = true;
            taskTitle.addEventListener('input', () => {
                task.name = taskTitle.value;
                const taskEl = document.querySelector(`.task-list-item[data-task-id="${task.id}"]`);
                if (taskEl) {
                    taskEl.querySelector('span').textContent = task.name;
                }
                saveTasks();
            });
        }
    }

    // Clear and reload blocks
    const currentTask = document.getElementById('currentTask');
    if (!currentTask) return;

    currentTask.innerHTML = '<div class="nested-blocks"></div>';
    const nestedBlocks = currentTask.querySelector('.nested-blocks');

    if (task.blocks && task.blocks.length > 0) {
        task.blocks.forEach(block => {
            let blockDiv;
            switch (block.type) {
                case 'tap':
                    blockDiv = addTapBlock(task);
                    if (block.region) {
                        const regionInfo = blockDiv.querySelector('.region-info');
                        if (regionInfo) {
                            regionInfo.classList.remove('text-muted');
                            regionInfo.textContent = `Region: (${Math.round(block.region.x1)}, ${Math.round(block.region.y1)}) - (${Math.round(block.region.x2)}, ${Math.round(block.region.y2)})`;
                        }
                        block.id = blockDiv.dataset.blockId;
                    }
                    break;
                case 'loop':
                    blockDiv = addLoopBlock(task);
                    if (block.iterations) {
                        blockDiv.querySelector('.iterations-input').value = block.iterations;
                    }
                    block.id = blockDiv.dataset.blockId;
                    break;
            }
            if (blockDiv) {
                nestedBlocks.appendChild(blockDiv);
            }
        });
    }
}

DEBUG.log('Initial state created', 'info', window.state);

class Simulator {
    constructor() {
        DEBUG.log('Initializing Simulator', 'info');

        this.simulator = document.getElementById('simulator');
        if (!this.simulator) {
            DEBUG.log('Simulator element not found', 'error');
            return;
        }

        this.selectionBox = document.getElementById('selectionBox');
        if (!this.selectionBox) {
            DEBUG.log('Selection box element not found', 'error');
            return;
        }

        this.isSelecting = false;
        this.startPos = { x: 0, y: 0 };

        //this.initializeEventListeners(); // Moved to DOMContentLoaded
        DEBUG.log('Simulator initialization complete', 'success');
    }

    initializeEventListeners() {
        try {
            this.simulator.addEventListener('mousedown', (e) => {
                if (state.focusedBlock && state.focusedBlock.type === 'tap') {
                    this.startSelection(e);
                }
            });

            this.simulator.addEventListener('mousemove', (e) => this.updateSelection(e));
            document.addEventListener('mouseup', () => this.endSelection());

            // Add create task button listener
            const newTaskBtn = document.getElementById('newTaskBtn');
            if (newTaskBtn) {
                newTaskBtn.addEventListener('click', () => {
                    const task = createNewTask();
                    renderTask(task);
                    saveTasks();
                });
            }

            DEBUG.log('Event listeners initialized', 'success');
        } catch (error) {
            DEBUG.log('Error initializing event listeners', 'error', error);
        }
    }

    startSelection(e) {
        if (!state.focusedBlock || state.focusedBlock.type !== 'tap') {
            return;
        }

        this.isSelecting = true;
        const rect = this.simulator.getBoundingClientRect();
        this.startPos = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };

        this.selectionBox.classList.remove('d-none');
        this.selectionBox.style.left = `${this.startPos.x}px`;
        this.selectionBox.style.top = `${this.startPos.y}px`;
        this.selectionBox.style.width = '0px';
        this.selectionBox.style.height = '0px';

        DEBUG.log('Selection started', 'info', this.startPos);
    }

    updateSelection(e) {
        if (!this.isSelecting) return;

        const rect = this.simulator.getBoundingClientRect();
        const currentPos = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };

        const width = currentPos.x - this.startPos.x;
        const height = currentPos.y - this.startPos.y;

        this.selectionBox.style.width = `${Math.abs(width)}px`;
        this.selectionBox.style.height = `${Math.abs(height)}px`;
        this.selectionBox.style.left = `${width < 0 ? currentPos.x : this.startPos.x}px`;
        this.selectionBox.style.top = `${height < 0 ? currentPos.y : this.startPos.y}px`;
    }

    endSelection() {
        if (!this.isSelecting) return;

        this.isSelecting = false;
        const bounds = this.selectionBox.getBoundingClientRect();
        const simulatorBounds = this.simulator.getBoundingClientRect();

        if (state.focusedBlock && state.focusedBlock.type === 'tap') {
            const region = {
                x1: ((bounds.left - simulatorBounds.left) / simulatorBounds.width) * DEVICE_WIDTH,
                y1: ((bounds.top - simulatorBounds.top) / simulatorBounds.height) * DEVICE_HEIGHT,
                x2: ((bounds.right - simulatorBounds.left) / simulatorBounds.width) * DEVICE_WIDTH,
                y2: ((bounds.bottom - simulatorBounds.top) / simulatorBounds.height) * DEVICE_HEIGHT
            };

            state.focusedBlock.region = region;
            const activeBlock = document.querySelector('.block.active-block');
            if (activeBlock) {
                const regionInfo = activeBlock.querySelector('.region-info');
                if (regionInfo) {
                    regionInfo.classList.remove('text-muted');
                    regionInfo.textContent = `Region: (${Math.round(region.x1)}, ${Math.round(region.y1)}) - (${Math.round(region.x2)}, ${Math.round(region.y2)})`;
                }
            }
            DEBUG.log('Region selected', 'success', region);
        }

        this.selectionBox.classList.add('d-none');
    }

    async executeTask(task) {
        DEBUG.log('Starting task execution', 'info', task);
        const executeBtn = document.getElementById('executeTaskBtn');
        if (executeBtn) executeBtn.disabled = true;

        try {
            if (task.blocks && task.blocks.length > 0) {
                for (const block of task.blocks) {
                    await this.executeBlock(block);
                }
                DEBUG.log('Task execution completed', 'success');
            } else {
                DEBUG.log('No blocks to execute', 'warning');
            }
        } catch (error) {
            DEBUG.log('Task execution failed', 'error', error);
        } finally {
            if (executeBtn) executeBtn.disabled = false;
        }
    }

    async executeTap(x, y) {
        return new Promise((resolve) => {
            const simulatorBounds = this.simulator.getBoundingClientRect();
            const scaledX = (x / DEVICE_WIDTH) * simulatorBounds.width;
            const scaledY = (y / DEVICE_HEIGHT) * simulatorBounds.height;

            // Create and show tap feedback
            const feedback = document.createElement('div');
            feedback.className = 'tap-feedback';
            feedback.style.left = `${scaledX}px`;
            feedback.style.top = `${scaledY}px`;
            this.simulator.appendChild(feedback);

            DEBUG.log('Tap executed', 'info', { x, y });

            // Wait for animation to complete
            setTimeout(() => {
                feedback.remove();
                resolve();
            }, 800);
        });
    }

    async executeBlock(block) {
        const blockElement = document.querySelector(`.block[data-block-id="${block.id}"]`);
        if (blockElement) {
            blockElement.classList.add('executing');
        }

        try {
            switch (block.type) {
                case 'tap':
                    if (block.region) {
                        const x = Math.random() * (block.region.x2 - block.region.x1) + block.region.x1;
                        const y = Math.random() * (block.region.y2 - block.region.y1) + block.region.y1;
                        await this.executeTap(x, y);
                    }
                    break;
                case 'loop':
                    const iterations = block.iterations || 1;
                    for (let i = 0; i < iterations; i++) {
                        for (const childBlock of block.blocks) {
                            await this.executeBlock(childBlock);
                        }
                    }
                    break;
                case 'function':
                    for (const childBlock of block.blocks) {
                        await this.executeBlock(childBlock);
                    }
                    break;
            }
        } catch (error) {
            DEBUG.log('Block execution error', 'error', error);
        } finally {
            if (blockElement) {
                blockElement.classList.remove('executing');
            }
        }
    }

    showTapFeedback(x, y) {
        const feedback = document.createElement('div');
        feedback.className = 'tap-feedback';
        feedback.style.left = `${x}px`;
        feedback.style.top = `${y}px`;
        this.simulator.appendChild(feedback);
        feedback.addEventListener('animationend', () => feedback.remove());
    }
}

function renderTask(task) {
    const taskListEl = document.getElementById('taskList');
    if (!taskListEl) return;

    const taskEl = document.createElement('div');
    taskEl.className = 'task-list-item';
    taskEl.dataset.taskId = task.id;
    taskEl.innerHTML = `
        <span contenteditable="true">${task.name}</span>
        <button class="btn btn-sm btn-outline-danger delete-btn">Delete</button>
    `;

    taskEl.addEventListener('click', (e) => {
        if (!e.target.classList.contains('delete-btn')) {
            loadTask(task);

            // Highlight selected task
            document.querySelectorAll('.task-list-item').forEach(el => {
                el.classList.remove('active');
            });
            taskEl.classList.add('active');
        }
    });

    taskEl.querySelector('.delete-btn').addEventListener('click', () => {
        const index = window.state.tasks.indexOf(task);
        if (index > -1) {
            window.state.tasks.splice(index, 1);
            taskEl.remove();

            // Clear current task if it was the deleted one
            if (window.state.currentTask === task) {
                window.state.currentTask = null;
                const currentTask = document.getElementById('currentTask');
                if (currentTask) {
                    currentTask.innerHTML = '';
                }
            }
            saveTasks();
        }
    });

    taskListEl.appendChild(taskEl);
}

// Initialize simulator when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.simulator = new Simulator();
    simulator.initializeEventListeners();

    // Add execute button handler
    document.getElementById('executeTaskBtn').addEventListener('click', () => {
        if (window.state.currentTask) {
            window.simulator.executeTask(window.state.currentTask);
        } else {
            DEBUG.log('No task selected', 'warning');
        }
    });

    // Add block button handlers
    const addTapBtn = document.getElementById('addTapBtn');
    const addLoopBtn = document.getElementById('addLoopBtn');
    const addFunctionBtn = document.getElementById('addFunctionBtn');

    if (addTapBtn && addLoopBtn && addFunctionBtn) {
        addTapBtn.onclick = () => {
            if (window.state.currentTask) {
                const tapDiv = window.addTapBlock(window.state.currentTask);
                const nestedBlocks = document.querySelector('#currentTask .nested-blocks');
                if (nestedBlocks) {
                    nestedBlocks.appendChild(tapDiv);
                    saveTasks();
                }
            }
        };

        addLoopBtn.onclick = () => {
            if (window.state.currentTask) {
                const loopDiv = window.addLoopBlock(window.state.currentTask);
                const nestedBlocks = document.querySelector('#currentTask .nested-blocks');
                if (nestedBlocks) {
                    nestedBlocks.appendChild(loopDiv);
                    saveTasks();
                }
            }
        };

        addFunctionBtn.onclick = () => {
            if (window.state.currentTask) {
                const functionDiv = window.addFunctionBlock(window.state.currentTask);
                const nestedBlocks = document.querySelector('#currentTask .nested-blocks');
                if (nestedBlocks) {
                    nestedBlocks.appendChild(functionDiv);
                    saveTasks();
                }
            }
        };
    }

    // Load saved tasks after DOM is ready
    const savedTasks = localStorage.getItem('tasks');
    if (savedTasks) {
        window.state.tasks = JSON.parse(savedTasks);
        window.state.tasks.forEach(task => renderTask(task));
    }

    DEBUG.log('Simulator initialized', 'success');
});

// Modify enableDrawingMode to show selection box for existing regions
function enableDrawingMode(tapBlock, tapDiv) {
    // Remove active state from other blocks
    document.querySelectorAll('.active-block').forEach(block => {
        if (block !== tapDiv) {
            block.classList.remove('active-block');
        }
    });

    tapDiv.classList.add('active-block');
    const simulator = document.getElementById('simulator');
    const selectionBox = document.getElementById('selectionBox');

    // Show existing region if it exists
    if (tapBlock.region) {
        const simulatorBounds = simulator.getBoundingClientRect();
        const scaledX1 = (tapBlock.region.x1 / DEVICE_WIDTH) * simulatorBounds.width;
        const scaledY1 = (tapBlock.region.y1 / DEVICE_HEIGHT) * simulatorBounds.height;
        const scaledX2 = (tapBlock.region.x2 / DEVICE_WIDTH) * simulatorBounds.width;
        const scaledY2 = (tapBlock.region.y2 / DEVICE_HEIGHT) * simulatorBounds.height;

        selectionBox.classList.remove('d-none');
        selectionBox.style.left = `${Math.min(scaledX1, scaledX2)}px`;
        selectionBox.style.top = `${Math.min(scaledY1, scaledY2)}px`;
        selectionBox.style.width = `${Math.abs(scaledX2 - scaledX1)}px`;
        selectionBox.style.height = `${Math.abs(scaledY2 - scaledY1)}px`;
    } else {
        selectionBox.classList.add('d-none');
    }

    let isSelecting = false;
    let startPos = { x: 0, y: 0 };

    simulator.removeEventListener('mousedown', startSelection);
    simulator.removeEventListener('mousemove', updateSelection);
    simulator.removeEventListener('mouseup', endSelection);

    simulator.addEventListener('mousedown', startSelection);
    simulator.addEventListener('mousemove', updateSelection);
    simulator.addEventListener('mouseup', endSelection);

    function startSelection(e) {
        if (!tapBlock || e.target.closest('.block')) return;

        const rect = simulator.getBoundingClientRect();
        startPos = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };

        selectionBox.classList.remove('d-none');
        selectionBox.style.left = `${startPos.x}px`;
        selectionBox.style.top = `${startPos.y}px`;
        selectionBox.style.width = '0px';
        selectionBox.style.height = '0px';

        isSelecting = true;
    }

    function updateSelection(e) {
        if (!isSelecting) return;

        const rect = simulator.getBoundingClientRect();
        const currentPos = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };

        const width = currentPos.x - startPos.x;
        const height = currentPos.y - startPos.y;

        selectionBox.style.width = `${Math.abs(width)}px`;
        selectionBox.style.height = `${Math.abs(height)}px`;
        selectionBox.style.left = `${width < 0 ? currentPos.x : startPos.x}px`;
        selectionBox.style.top = `${height < 0 ? currentPos.y : startPos.y}px`;
    }

    function endSelection() {
        if (!isSelecting || !tapBlock) return;

        isSelecting = false;
        const rect = simulator.getBoundingClientRect();
        const bounds = selectionBox.getBoundingClientRect();

        const region = {
            x1: ((bounds.left - rect.left) / rect.width) * DEVICE_WIDTH,
            y1: ((bounds.top - rect.top) / rect.height) * DEVICE_HEIGHT,
            x2: ((bounds.right - rect.left) / rect.width) * DEVICE_WIDTH,
            y2: ((bounds.bottom - rect.top) / rect.height) * DEVICE_HEIGHT
        };

        tapBlock.region = region;
        const regionInfo = tapDiv.querySelector('.region-info');
        if (regionInfo) {
            regionInfo.classList.remove('text-muted');
            regionInfo.textContent = `Region: (${Math.round(region.x1)}, ${Math.round(region.y1)}) - (${Math.round(region.x2)}, ${Math.round(region.y2)})`;
        }

        saveTasks();
    }
} 