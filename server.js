const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const multer = require('multer');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

const PORT = 3000;
const TASKS_DIR = path.join(__dirname, 'tasks');

// Replace with the actual IP addresses you want to allow delete and move
const allowedIPs = ['192.168.1.101', '203.0.113.46', '192.168.10.160', '127.0.0.1', '::1', '192.168.10.159'];

// To keep track of connected users and their IP addresses
let connectedUsers = {};

const isAllowedIp = (req) => {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const formattedIp = clientIp.replace('::ffff:', ''); // Remove IPv6 prefix for IPv4 addresses
    return allowedIPs.includes(formattedIp);
};

// Set up multer for file upload handling
const upload = multer({ dest: 'uploads/' }); // Temporary folder for file uploads

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/tasks', express.static(TASKS_DIR));

// Add this new endpoint to get notes
app.get('/tasks/:folder/notes', (req, res) => {
    const notesFilePath = path.join(TASKS_DIR, req.params.folder, 'notes.txt');
    fs.readFile(notesFilePath, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ error: 'Unable to fetch notes.' });
        }
        res.send(data);
    });
});

// Add this new endpoint to save notes
app.post('/tasks/:folder/notes', (req, res) => {
    const notesFilePath = path.join(TASKS_DIR, req.params.folder, 'notes.txt');
    const notes = req.body.notes;

    fs.writeFile(notesFilePath, notes, 'utf8', (err) => {
        if (err) {
            return res.status(500).json({ error: 'Unable to save notes.' });
        }
        io.emit('taskUpdate', { id: req.params.folder });
        res.json({ success: true });
    });
});


app.get('/tasks', (req, res) => {
    fs.readdir(TASKS_DIR, (err, folders) => {
        if (err) {
            return res.status(500).json({ error: 'Unable to fetch tasks.' });
        }

        const tasks = folders.map(folder => ({
            id: folder,
            description: folder,
            category: 'Quality Open Projects',
            state: 'To Do',
            completed: false
        }));

        res.json(tasks);
    });
});

app.get('/tasks/:folder', (req, res) => {
    const folderPath = path.join(TASKS_DIR, req.params.folder);
    fs.readdir(folderPath, { withFileTypes: true }, (err, items) => {
        if (err) {
            return res.status(500).json({ error: 'Unable to fetch folder contents.' });
        }

        const contents = items.map(item => ({
            name: item.name,
            isFolder: item.isDirectory()
        }));

        res.json(contents);
    });
});


app.post('/tasks/:folder/upload', upload.single('file'), (req, res) => {
    const folderPath = path.join(TASKS_DIR, req.params.folder);
    const filePath = path.join(folderPath, req.file.originalname);

    fs.rename(req.file.path, filePath, (err) => {
        if (err) {
            console.error('Error saving file:', err);
            return res.status(500).json({ error: 'Unable to save file.' });
        }

        console.log(`File uploaded: ${filePath}`);
        io.emit('taskUpdate', { id: req.params.folder });
        res.json({ success: true, file: req.file.originalname });
    });
});

app.post('/tasks/:folder/move', (req, res) => {

    if (!isAllowedIp(req)) {
        return res.status(403).json({ error: 'Your IP address is not allowed to move tasks.' });
    }

    const folderName = req.params.folder;
    const sourcePath = path.join(TASKS_DIR, folderName);
    const destinationDir = path.join(__dirname, 'tasksdone');
    const destinationPath = path.join(destinationDir, folderName);

    // Check if the 'tasksdone' directory exists, if not, create it
    fs.access(destinationDir, fs.constants.F_OK, (err) => {
        if (err) {
            // Directory doesn't exist, create it
            fs.mkdir(destinationDir, { recursive: true }, (err) => {
                if (err) {
                    console.error('Error creating tasksdone directory:', err);
                    return res.status(500).json({ error: 'Unable to create tasksdone directory.' });
                }

                // Once the directory is confirmed to exist, move the folder
                moveFolder(sourcePath, destinationPath, res);
            });
        } else {
            // Directory exists, move the folder
            moveFolder(sourcePath, destinationPath, res);
        }
    });
});

// Helper function to move the folder
const moveFolder = (sourcePath, destinationPath, res) => {
    fs.rename(sourcePath, destinationPath, (err) => {
        if (err) {
            console.error('Error moving folder:', err);
            return res.status(500).json({ error: 'Unable to move folder.' });
        }

        console.log(`Folder moved from ${sourcePath} to ${destinationPath}`);
        io.emit('taskUpdate', { id: path.basename(sourcePath), moved: true });
        res.json({ success: true });
    });
};

app.get('/check-ip', (req, res) => {
    if (isAllowedIp(req)) {
        res.json({ allowed: true });
    } else {
        res.json({ allowed: false });
    }
});


app.get('/connected-users', (req, res) => {
    res.json(connectedUsers);
});

io.on('connection', (socket) => {
    const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
    const formattedIp = clientIp.replace('::ffff:', ''); // Remove IPv6 prefix for IPv4 addresses
    connectedUsers[socket.id] = formattedIp;

    console.log('New client connected:', formattedIp);

    socket.on('disconnect', () => {
        console.log('Client disconnected:', connectedUsers[socket.id]);
        delete connectedUsers[socket.id];
    });

    socket.on('taskUpdate', (task) => {
        io.emit('taskUpdate', task);
    });

    socket.on('resetTasks', () => {
        io.emit('resetTasks');
    });
});

http.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
