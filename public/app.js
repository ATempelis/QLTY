document.addEventListener('DOMContentLoaded', async () => {
    const socket = io();
    const tasksContainer = document.getElementById('tasksContainer');
    const feedbackMessage = document.getElementById('feedbackMessage');
    const taskTemplate = document.getElementById('taskTemplate').content;

    let tasks = [];
    let isAllowed = false;

    try {
        const response = await fetch('/check-ip');
        const data = await response.json();
        isAllowed = data.allowed;
    } catch (error) {
        console.error('Failed to check IP allowance:', error);
    }

    const stateColors = {
        'To Do': 'blue',
        'In Progress': 'orange',
        'Done': 'green'
    };

    const states = ['To Do', 'In Progress', 'Done'];

    const fetchTasks = async () => {
        try {
            const response = await fetch('/tasks');
            const folderTasks = await response.json();
            const existingTasks = JSON.parse(localStorage.getItem('tasks')) || [];

            folderTasks.forEach(folderTask => {
                const existingTask = existingTasks.find(task => task.id === folderTask.id);
                if (existingTask) {
                    folderTask.state = existingTask.state;
                    folderTask.completed = existingTask.completed;
                }
            });

            tasks = [...folderTasks];
            localStorage.setItem('tasks', JSON.stringify(tasks));
            renderTasks();
        } catch (error) {
            console.error('Failed to fetch tasks:', error);
            showFeedback('Failed to fetch tasks.', 'error');
        }
    };

    const fetchTaskContents = async (folderName) => {
        try {
            const response = await fetch(`/tasks/${encodeURIComponent(folderName)}`);
            const contents = await response.json();
            return contents;
        } catch (error) {
            console.error(`Failed to fetch contents of ${folderName}:`, error);
            showFeedback(`Failed to fetch contents of ${folderName}.`, 'error');
            return [];
        }
    };

    const renderTasks = () => {
        tasksContainer.innerHTML = '';
        const categorizedTasks = tasks.reduce((acc, task) => {
            if (task.id) {
                acc[task.category] = acc[task.category] || [];
                acc[task.category].push(task);
            }
            return acc;
        }, {});

        for (const category in categorizedTasks) {
            const categorySection = document.createElement('div');
            categorySection.classList.add('category');
            categorySection.innerHTML = `<h2>${category}</h2>`;
            categorizedTasks[category].forEach((task) => {
                const taskElement = taskTemplate.cloneNode(true);
                const taskDiv = taskElement.querySelector('.task');
                const stateButton = taskElement.querySelector('.state-btn');
                const moveButton = taskElement.querySelector('.move-btn');
                const showContentsButton = taskElement.querySelector('.showContents');
                const contentsList = taskElement.querySelector('.contents');
                const uploadContainer = taskElement.querySelector('.uploadContainer');
                const uploadForm = taskElement.querySelector('.uploadForm');
                const fileInput = taskElement.querySelector('.fileInput');
                const notesContainer = taskElement.querySelector('.notesContainer');
                const notesInput = taskElement.querySelector('.notesInput');
                const saveNotesButton = taskElement.querySelector('.saveNotes');

                taskDiv.classList.add(task.state.toLowerCase().replace(' ', '-'));
                if (task.completed) {
                    taskDiv.classList.add('completed');
                }

                if (!isAllowed) {
                    moveButton.classList.add('hidden');
                } else {
                    moveButton.classList.remove('hidden');
                }

                taskDiv.querySelector('span').textContent = task.description;
                stateButton.textContent = task.state;
                stateButton.style.backgroundColor = stateColors[task.state];
                stateButton.style.borderColor = stateColors[task.state];

                showContentsButton.addEventListener('click', async () => {
                    if (contentsList.classList.contains('hidden')) {
                        const contents = await fetchTaskContents(task.id);
                        contentsList.innerHTML = contents.map(item => `
                            <li>
                                ${item.isFolder ? `<strong>${item.name}</strong>` : `<a href="/tasks/${encodeURIComponent(task.id)}/${encodeURIComponent(item.name)}" target="_blank">${item.name}</a>`}
                            </li>
                        `).join('');
                        contentsList.classList.remove('hidden');
                        uploadContainer.classList.remove('hidden');
                        notesContainer.classList.remove('hidden');

                        // Fetch and display notes
                        const notesResponse = await fetch(`/tasks/${encodeURIComponent(task.id)}/notes`);
                        if (notesResponse.ok) {
                            const notesText = await notesResponse.text();
                            notesInput.value = notesText;
                        }

                        showContentsButton.textContent = 'Hide Contents';
                    } else {
                        contentsList.classList.add('hidden');
                        uploadContainer.classList.add('hidden');
                        notesContainer.classList.add('hidden');
                        showContentsButton.textContent = 'Show Contents';
                    }
                });

                uploadForm.addEventListener('submit', async (event) => {
                    event.preventDefault();
                    const formData = new FormData(uploadForm);
                    try {
                        const response = await fetch(`/tasks/${encodeURIComponent(task.id)}/upload`, {
                            method: 'POST',
                            body: formData
                        });
                        const result = await response.json();
                        if (result.success) {
                            showFeedback(`File "${result.file}" uploaded successfully.`, 'success');
                            socket.emit('taskUpdate', { id: task.id });
                        } else {
                            showFeedback('Failed to upload file.', 'error');
                        }
                    } catch (error) {
                        console.error('File upload error:', error);
                        showFeedback('Failed to upload file.', 'error');
                    }
                });

                saveNotesButton.addEventListener('click', async () => {
                    const notes = notesInput.value;
                    try {
                        const response = await fetch(`/tasks/${encodeURIComponent(task.id)}/notes`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ notes })
                        });
                        const result = await response.json();
                        if (result.success) {
                            showFeedback('Notes saved successfully.', 'success');
                            socket.emit('taskUpdate', { id: task.id });
                        } else {
                            showFeedback('Failed to save notes.', 'error');
                        }
                    } catch (error) {
                        console.error('Error saving notes:', error);
                        showFeedback('Failed to save notes.', 'error');
                    }
                });


                taskElement.querySelector('.move-btn').addEventListener('click', () => {
                    moveTask(task.id, task.description);
                });

                stateButton.addEventListener('click', () => {
                    toggleState(task.id);
                });

                categorySection.appendChild(taskElement);
            });
            tasksContainer.appendChild(categorySection);
        }
    };

    const showFeedback = (message, type) => {
        feedbackMessage.textContent = message;
        feedbackMessage.className = `feedbackMessage ${type}`;
        feedbackMessage.classList.add('visible');
        setTimeout(() => {
            feedbackMessage.classList.remove('visible');
        }, 3000);
    };

    const toggleState = (id) => {
        const task = tasks.find(task => task.id === id);
        if (task && task.state !== 'Done') {
            const currentIndex = states.indexOf(task.state);
            task.state = states[(currentIndex + 1) % states.length];
            localStorage.setItem('tasks', JSON.stringify(tasks));
            renderTasks();
            socket.emit('taskUpdate', task);
        }
    };
    const moveTask = async (id) => {
        try {
            const response = await fetch(`/tasks/${encodeURIComponent(id)}/move`, {
                method: 'POST',
            });
            if (!response.ok) {
                throw new Error('Failed to move task.');
            }
    
            // Remove task from local state and update UI
            tasks = tasks.filter(task => task.id !== id);
            localStorage.setItem('tasks', JSON.stringify(tasks));
            renderTasks();
    
            // Notify server about the move
            socket.emit('taskUpdate', { id, moved: true });
    
            showFeedback('Task moved successfully!', 'success');
        } catch (error) {
            console.error('Error moving task:', error);
            showFeedback('Failed to move task.', 'error');
        }
    };



    socket.on('taskUpdate', (task) => {
        const existingTask = tasks.find(t => t.id === task.id);
            if (existingTask) {
                Object.assign(existingTask, task);
            } else {
                tasks.push(task);
            }
        localStorage.setItem('tasks', JSON.stringify(tasks));
        fetchTasks(); // Re-fetch tasks to update the UI
        renderTasks();
    });

    socket.on('resetTasks', () => {
        fetchTasks(); // Re-fetch tasks to reset UI
    });

    fetchTasks(); // Initial load of tasks
});
