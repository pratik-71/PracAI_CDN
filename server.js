require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const s3Service = require('./services/s3Service');
const galleryRoutes = require('./routes/galleryRoutes');

const app = express();
const port = process.env.PORT || 3000;

// Debug logging
console.log('Environment variables:');
console.log('AWS_BUCKET_NAME:', process.env.AWS_BUCKET_NAME);
console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? '****' : 'not set');
console.log('AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? '****' : 'not set');

// Configure multer for file upload
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 500 * 1024 * 1024, // 500MB limit
        fieldSize: 500 * 1024 * 1024 // 500MB limit
    }
});

// Add JSON body parser middleware with increased limit
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));

// Serve static files from public directory
app.use(express.static('public'));

// API Routes
app.use('/api/gallery', galleryRoutes);

// API to get all folders and subfolders (for dynamic dropdowns)
app.get('/api/folders', async (req, res) => {
    try {
        // Default folders and subfolders
        const defaultFolders = {
            webpage: ['about', 'home', 'auth', 'misc'],
            game: ['week1', 'week2', 'week3', 'week4']
        };
        let s3Folders = {};
        try {
            const allFiles = await s3Service.listFiles();
            // Build folder structure from S3
            allFiles.forEach(file => {
                const [main, sub] = file.key.split('/');
                if (!main || !sub) return;
                if (!s3Folders[main]) s3Folders[main] = new Set();
                s3Folders[main].add(sub);
            });
        } catch (e) {
            // If S3 fails, just use defaults
            s3Folders = {};
        }
        // Merge S3 folders with defaults
        const merged = { ...defaultFolders };
        for (const main in s3Folders) {
            if (!merged[main]) merged[main] = [];
            s3Folders[main].forEach(sub => {
                if (!merged[main].includes(sub)) merged[main].push(sub);
            });
        }
        res.json(merged);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch folders' });
    }
});

// Route handlers
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/gallery', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'gallery.html'));
});

// Handle upload endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded.' });
        }

        const mainFolder = req.body.mainFolder;

        if (!mainFolder) {
            return res.status(400).json({ error: 'Main folder is required.' });
        }

        // Check if AWS credentials are configured
        if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_BUCKET_NAME) {
            console.error('AWS credentials not configured properly');
            return res.status(500).json({ 
                error: 'Server configuration error. Please check AWS credentials.',
                details: 'AWS credentials are not properly configured on the server.'
            });
        }

        // Construct folder path - make subfolder optional
        const subfolder = req.body.subfolder || '';
        const folderPath = subfolder ? `${mainFolder}/${subfolder}/` : `${mainFolder}/`;
        const fileName = req.file.originalname || Date.now().toString();
        const fileBuffer = req.file.buffer;

        try {
            const fileUrl = await s3Service.uploadFile(fileName, fileBuffer, folderPath);
            
            res.json({
                success: true,
                message: 'File uploaded successfully',
                folder: folderPath,
                fileUrl: fileUrl
            });
        } catch (s3Error) {
            console.error('S3 Upload Error:', s3Error);
            
            // Send detailed error response
            res.status(500).json({ 
                error: 'Error uploading file to S3',
                details: s3Error.message || 'Unknown S3 error'
            });
        }
    } catch (error) {
        console.error('Server Error:', error);
        res.status(500).json({ 
            error: 'Server error occurred',
            details: error.message || 'Unknown server error'
        });
    }
});

// Add this route to handle file replacement from the gallery
app.post('/gallery/replace', upload.single('file'), async (req, res) => {
    try {
        const { fileKey, oldKey } = req.body; // fileKey is the new key, oldKey is the original
        if (!fileKey || !req.file) {
            return res.status(400).json({ error: 'Missing file or fileKey' });
        }
        // Upload the new file
        const folderPath = fileKey.substring(0, fileKey.lastIndexOf('/') + 1);
        const fileName = fileKey.split('/').pop();
        await s3Service.uploadFile(fileName, req.file.buffer, folderPath);
        // If the key changed, delete the old file
        if (oldKey && oldKey !== fileKey) {
            await s3Service.deleteFile(oldKey);
        }
        res.json({ success: true, message: 'File replaced successfully' });
    } catch (err) {
        console.error('Replace error:', err);
        res.status(500).json({ error: 'Failed to replace file' });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something broke!' });
});

// Handle 404 - Keep this as the last route
app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'API endpoint not found' });
    } else {
        res.status(404).sendFile(path.join(__dirname, 'public', 'gallery.html'));
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
}); 