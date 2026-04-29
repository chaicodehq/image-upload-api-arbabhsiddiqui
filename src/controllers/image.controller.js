import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Image } from '../models/image.model.js';
import { generateThumbnail, getImageDimensions } from '../utils/thumbnail.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '../../uploads');
const THUMBNAILS_DIR = path.join(UPLOADS_DIR, 'thumbnails');

/**
 * TODO: Upload image
 *
 * 1. Check if file uploaded (if !req.file, return 400 "No file uploaded")
 * 2. Get file info from req.file (filename, originalname, mimetype, size)
 * 3. Get image dimensions using getImageDimensions(filepath)
 * 4. Generate thumbnail using generateThumbnail(filename)
 * 5. Extract optional fields from req.body (description, tags)
 *    - Parse tags: split by comma and trim each tag
 * 6. Save metadata to database (Image.create)
 * 7. Return 201 with image metadata
 */
export async function uploadImage(req, res, next) {
  try {


    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: { message: "No file uploaded" } });
    }

    const { filename, originalname, mimetype, size } = file;
    const filePath = req.file.path;

    const dimensions = await getImageDimensions(filePath);
    const thumbnailFilename = await generateThumbnail(filename);

    const { description, tags } = req.body;
    const tagsArray = tags ? tags.split(',').map(tag => tag.trim()) : [];

    const image = await Image.create({
      filename,
      originalName: originalname,
      mimetype,
      size,
      width: dimensions.width,
      height: dimensions.height,
      thumbnailFilename,
      description,
      tags: tagsArray
    });

    res.status(201).json(image);


  } catch (error) {
    next(error);
  }
}

/**
 * TODO: List images with pagination and filtering
 *
 * 1. Extract query parameters:
 *    - page (default 1)
 *    - limit (default 10, max 50)
 *    - search (search in originalName and description)
 *    - mimetype (filter by mimetype)
 *    - sortBy (field to sort by, default 'uploadDate')
 *    - sortOrder (asc or desc, default 'desc')
 *
 * 2. Build MongoDB query:
 *    - Add text search if search parameter provided
 *    - Add mimetype filter if provided
 *
 * 3. Calculate pagination:
 *    - skip = (page - 1) * limit
 *    - total = await Image.countDocuments(query)
 *    - pages = Math.ceil(total / limit)
 *
 * 4. Fetch images with sorting and pagination:
 *    - Image.find(query).sort({[sortBy]: sortOrder === 'asc' ? 1 : -1}).skip(skip).limit(limit)
 *
 * 5. Calculate totalSize (sum of all image sizes)
 *
 * 6. Return 200 with:
 *    - data: images array
 *    - meta: { total, page, limit, pages, totalSize }
 */
export async function listImages(req, res, next) {
  try {

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const search = req.query.search || '';
    const mimetype = req.query.mimetype;
    const sortBy = req.query.sortBy || 'uploadDate';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    const query = {};
    if (search) {
      query.$text = { $search: search };
    }
    if (mimetype) {
      query.mimetype = mimetype;
    }

    const skip = (page - 1) * limit;
    const total = await Image.countDocuments(query);
    const pages = Math.ceil(total / limit);

    const images = await Image.find(query)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit);

    const totalSizeAgg = await Image.aggregate([
      { $match: query },
      { $group: { _id: null, totalSize: { $sum: "$size" } } }
    ]);
    const totalSize = totalSizeAgg[0] ? totalSizeAgg[0].totalSize : 0;

    res.status(200).json({
      data: images,
      meta: {
        total,
        page,
        limit,
        pages,
        totalSize
      }
    });

  } catch (error) {
    next(error);
  }
}

/**
 * TODO: Get image metadata by ID
 *
 * 1. Find image by req.params.id
 * 2. If not found: return 404 "Image not found"
 * 3. Return 200 with image metadata
 */
export async function getImage(req, res, next) {
  try {
    if (!req.params.id) {
      return res.status(400).json({ error: { message: "Image ID is required" } });
    }

    const image = await Image.findById(req.params.id);
    if (!image) {
      return res.status(404).json({ error: { message: "Image not found" } });
    }

    res.status(200).json(image);
  } catch (error) {
    next(error);
  }
}

/**
 * TODO: Download original image
 *
 * 1. Find image by req.params.id
 * 2. If not found: return 404 "Image not found"
 * 3. Construct file path
 * 4. Check if file exists using fs.existsSync()
 * 5. If file missing: return 404 "File not found"
 * 6. Set headers:
 *    - Content-Type: image.mimetype
 *    - Content-Disposition: attachment; filename="originalName"
 * 7. Send file using res.sendFile(filepath)
 */
export async function downloadImage(req, res, next) {
  try {
    if (!req.params.id) {
      return res.status(400).json({ error: { message: "Image ID is required" } });
    }

    const image = await Image.findById(req.params.id);
    if (!image) {
      return res.status(404).json({ error: { message: "Image not found" } });
    }

    const filePath = path.join(UPLOADS_DIR, image.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: { message: "File not found" } });
    }

    res.setHeader('Content-Type', image.mimetype);
    res.setHeader('Content-Disposition', `attachment; filename="${image.originalName}"`);
    res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
}

/**
 * TODO: Download thumbnail
 *
 * 1. Find image by req.params.id
 * 2. If not found: return 404 "Image not found"
 * 3. Construct thumbnail path
 * 4. Check if thumbnail exists
 * 5. If missing: return 404 "File not found"
 * 6. Set headers:
 *    - Content-Type: image/jpeg (thumbnails are always JPEG)
 * 7. Send file using res.sendFile(thumbnailPath)
 */
export async function downloadThumbnail(req, res, next) {
  try {
    if (!req.params.id) {
      return res.status(400).json({ error: { message: "Image ID is required" } });
    }

    const image = await Image.findById(req.params.id);
    if (!image) {
      return res.status(404).json({ error: { message: "Image not found" } });
    }

    const thumbnailPath = path.join(THUMBNAILS_DIR, image.thumbnailFilename);
    if (!fs.existsSync(thumbnailPath)) {
      return res.status(404).json({ error: { message: "File not found" } });
    }

    res.setHeader('Content-Type', 'image/jpeg');
    res.sendFile(thumbnailPath);
  } catch (error) {
    next(error);
  }
}

/**
 * TODO: Delete image
 *
 * 1. Find image by req.params.id
 * 2. If not found: return 404 "Image not found"
 * 3. Delete original file (use try-catch, ignore ENOENT errors)
 * 4. Delete thumbnail (use try-catch, ignore ENOENT errors)
 * 5. Delete metadata from database
 * 6. Return 204 (no content)
 */
export async function deleteImage(req, res, next) {
  try {
    if (!req.params.id) {
      return res.status(400).json({ error: { message: "Image ID is required" } });
    }

    const image = await Image.findById(req.params.id);
    if (!image) {
      return res.status(404).json({ error: { message: "Image not found" } });
    }

    const filePath = path.join(UPLOADS_DIR, image.filename);
    const thumbnailPath = path.join(THUMBNAILS_DIR, image.thumbnailFilename);

    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error(`Error deleting file ${filePath}:`, err);
      }
    }

    try {
      fs.unlinkSync(thumbnailPath);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error(`Error deleting thumbnail ${thumbnailPath}:`, err);
      }
    }

    await Image.findByIdAndDelete(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
