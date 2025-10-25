const mongoose = require('mongoose');

const testAssignmentSchema = new mongoose.Schema({
  testName: {
    type: String,
    trim: true
  },
  subject: {
    type: String,
    trim: true
  },
  courseName: {
    type: String,
    trim: true
  },
  dueDate: {
    type: String
  },
  fileUrl: {
    type: String
  },
  fileName: {
    type: String
  },
  teacherId: {
    type: String
  },
  teacherName: {
    type: String
  },
  assignedDate: {
    type: Date,
    default: Date.now
  },
  studentPhone: {
    type: String
  },
  studentId: {
    type: String
  },
  status: {
    type: String,
    enum: ['assigned', 'completed', 'overdue'],
    default: 'assigned'
  }
}, { timestamps: true });

const TestAssignment = mongoose.model('TestAssignment', testAssignmentSchema);

module.exports = { TestAssignment, testAssignmentSchema };
