const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand, CopyObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

class S3Service {
    constructor() {
        this.s3Client = new S3Client({
            region: 'us-east-1',
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
            }
        });
        this.bucketName = process.env.AWS_BUCKET_NAME;
    }

    async uploadFile(fileName, fileBuffer, folderPath) {
        try {
            const uploadParams = {
                Bucket: this.bucketName,
                Key: `${folderPath}${fileName}`,
                Body: fileBuffer,
                ContentType: this.getContentType(fileName)
            };

            const command = new PutObjectCommand(uploadParams);
            await this.s3Client.send(command);
            return `https://${this.bucketName}.s3.amazonaws.com/${folderPath}${fileName}`;
        } catch (error) {
            console.error('Error uploading file:', error);
            throw error;
        }
    }

    async deleteFile(key) {
        try {
            const deleteParams = {
                Bucket: this.bucketName,
                Key: key
            };

            const command = new DeleteObjectCommand(deleteParams);
            await this.s3Client.send(command);
            return true;
        } catch (error) {
            console.error('Error deleting file:', error);
            throw error;
        }
    }

    async moveFile(oldKey, newKey) {
        try {
            // Copy to new location
            const copyParams = {
                Bucket: this.bucketName,
                CopySource: `${this.bucketName}/${oldKey}`,
                Key: newKey,
            };

            const copyCommand = new CopyObjectCommand(copyParams);
            await this.s3Client.send(copyCommand);

            // Delete from old location
            await this.deleteFile(oldKey);

            return `https://${this.bucketName}.s3.amazonaws.com/${newKey}`;
        } catch (error) {
            console.error('Error moving file:', error);
            throw error;
        }
    }

    getContentType(fileName) {
        const ext = fileName.split('.').pop().toLowerCase();
        const contentTypes = {
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'svg': 'image/svg+xml',
            'pdf': 'application/pdf',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xls': 'application/vnd.ms-excel',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'txt': 'text/plain',
            'json': 'application/json'
        };
        return contentTypes[ext] || 'application/octet-stream';
    }

    async listFiles(prefix = '') {
        try {
            const command = new ListObjectsV2Command({
                Bucket: this.bucketName,
                Prefix: prefix
            });

            const data = await this.s3Client.send(command);
            
            // Handle case when bucket is empty or no matching files
            if (!data.Contents || data.Contents.length === 0) {
                return [];
            }

            return data.Contents.map(item => ({
                key: item.Key,
                url: `https://${this.bucketName}.s3.amazonaws.com/${item.Key}`,
                lastModified: item.LastModified,
                size: item.Size,
                folder: item.Key.split('/')[0],
                subfolder: item.Key.split('/')[1] || null
            }));
        } catch (error) {
            console.error('Error listing files:', error);
            throw error;
        }
    }

    async listFilesByFolder() {
        try {
            const allFiles = await this.listFiles();
            const organizedFiles = {};

            // If no files, return empty object
            if (!allFiles || allFiles.length === 0) {
                return {};
            }

            allFiles.forEach(file => {
                const [mainFolder, subfolder] = file.key.split('/');
                
                if (!mainFolder) return;

                if (!organizedFiles[mainFolder]) {
                    organizedFiles[mainFolder] = {};
                }

                if (subfolder) {
                    const subfolderName = subfolder.split('/')[0];
                    if (!organizedFiles[mainFolder][subfolderName]) {
                        organizedFiles[mainFolder][subfolderName] = [];
                    }
                    if (file.key.endsWith('/')) return; // Skip folder entries
                    organizedFiles[mainFolder][subfolderName].push(file);
                }
            });

            // Remove empty folders
            for (const mainFolder in organizedFiles) {
                if (Object.keys(organizedFiles[mainFolder]).length === 0) {
                    delete organizedFiles[mainFolder];
                }
            }

            return organizedFiles;
        } catch (error) {
            console.error('Error organizing files:', error);
            throw error;
        }
    }
}

module.exports = new S3Service(); 