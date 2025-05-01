const express = require('express');
const router = express.Router();
const s3Service = require('../services/s3Service');
const multer = require('multer');
const fs = require('fs');

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

// Get all images organized by folders
router.get('/', async (req, res) => {
    try {
        const files = await s3Service.listFilesByFolder();
        res.json(files);
    } catch (error) {
        console.error('Error fetching gallery:', error);
        res.status(500).json({ error: 'Error fetching gallery' });
    }
});

// Get images by main folder
router.get('/:folder', async (req, res) => {
    try {
        const files = await s3Service.listFiles(req.params.folder + '/');
        res.json(files);
    } catch (error) {
        console.error('Error fetching folder:', error);
        res.status(500).json({ error: 'Error fetching folder' });
    }
});

// Get images by subfolder
router.get('/:folder/:subfolder', async (req, res) => {
    try {
        const files = await s3Service.listFiles(`${req.params.folder}/${req.params.subfolder}/`);
        res.json(files);
    } catch (error) {
        console.error('Error fetching subfolder:', error);
        res.status(500).json({ error: 'Error fetching subfolder' });
    }
});

// Delete a file
router.delete('/:key(*)', async (req, res) => {
    try {
        await s3Service.deleteFile(req.params.key);
        res.json({ success: true, message: 'File deleted successfully' });
    } catch (error) {
        console.error('Error deleting file:', error);
        res.status(500).json({ error: 'Error deleting file' });
    }
});

// Move a file
router.post('/move', async (req, res) => {
    try {
        const { oldKey, newFolder, newSubfolder, fileName } = req.body;
        if (!oldKey || !newFolder || !newSubfolder || !fileName) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        const newKey = `${newFolder}/${newSubfolder}/${fileName}`;
        const newUrl = await s3Service.moveFile(oldKey, newKey);
        
        res.json({
            success: true,
            message: 'File moved successfully',
            newUrl: newUrl,
            newKey: newKey
        });
    } catch (error) {
        console.error('Error moving file:', error);
        res.status(500).json({ error: 'Error moving file' });
    }
});

// Replace a file
router.post('/replace', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded.' });
        }

        const fileKey = req.body.fileKey;
        if (!fileKey) {
            return res.status(400).json({ error: 'No file key provided.' });
        }

        const fileBuffer = fs.readFileSync(req.file.path);

        // Upload new file with same key as old file
        const fileUrl = await s3Service.uploadFile(fileKey.split('/').pop(), fileBuffer, fileKey.substring(0, fileKey.lastIndexOf('/') + 1));
        
        // Clean up: delete the local file
        fs.unlinkSync(req.file.path);

        res.json({
            success: true,
            message: 'File replaced successfully',
            fileUrl: fileUrl
        });
    } catch (error) {
        console.error('Error replacing file:', error);
        res.status(500).json({ error: 'Error replacing file' });
    }
});

module.exports = router; 