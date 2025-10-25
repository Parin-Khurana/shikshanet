const mongoose = require('mongoose');

const doubtSchema = new mongoose.Schema({
  studentId: {
    type: String,
    required: true,
    trim: true
  },
  studentName: {
    type: String,
    required: true,
    trim: true
  },
  studentPhone: {
    type: String,
    required: true,
    trim: true
  },
  studentEmail: {
    type: String,
    required: true,
    trim: true
  },
  teacherId: {
    type: String,
    required: true,
    trim: true
  },
  teacherName: {
    type: String,
    required: true,
    trim: true
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  courseName: {
    type: String,
    required: true,
    trim: true
  },
  doubtTitle: {
    type: String,
    required: true,
    trim: true
  },
  doubtDescription: {
    type: String,
    required: true,
    trim: true
  },
  doubtType: {
    type: String,
    enum: ['conceptual', 'numerical', 'assignment', 'general'],
    default: 'general'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'resolved', 'closed'],
    default: 'pending'
  },
  teacherResponse: {
    type: String,
    default: ''
  },
  responseDate: {
    type: Date,
    default: null
  },
  attachments: [{
    fileName: String,
    fileUrl: String,
    uploadedBy: String // 'student' or 'teacher'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

const Doubt = mongoose.model('Doubt', doubtSchema);

module.exports = { Doubt, doubtSchema };
