const mongoose = require('mongoose');

const testAssignmentSchema = new mongoose.Schema({
  testName: {
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
  dueDate: {
    type: String,
    required: true
  },
  fileUrl: {
    type: String,
    required: true
  },
  fileName: {
    type: String,
    required: true
  },
  teacherId: {
    type: String,
    required: true
  },
  teacherName: {
    type: String,
    required: true
  },
  assignedDate: {
    type: Date,
    default: Date.now
  },
  studentPhone: {
    type: String,
    required: true
  },
  studentId: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['assigned', 'completed', 'overdue'],
    default: 'assigned'
  }
}, { timestamps: true });

module.exports = mongoose.model('TestAssignment', testAssignmentSchema);
