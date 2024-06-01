const fs = require('fs');
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const answersheetModel = require("../models/answersheet");
const testModel = require("../models/test");
const subjectModel = require("../models/subject");
const testService = require("./test");

const getUserCompletedTestsCSV = async (userId) => {
  try {
    const answersheets = await answersheetModel.find({ student: userId, completed: true }, { test: 1, answers: 1, score: 1 }).lean();

    if (answersheets.length === 0) {
      console.log('No completed tests found for the given user ID.');
      return;
    }

    const testIds = answersheets.map(x => x.test);
    const tests = await testModel.find({ _id: { $in: testIds } }).sort({ resultTime: -1 }).lean();

    for (const test of tests) {
      const correctStatus = testService.getTestStatus(test);
      if (correctStatus !== test.status) {
        await testService.updateStatus(test._id, correctStatus);
        test.status = correctStatus;
      }
    }

    const subjects = await subjectModel.find({}, { _id: 1, name: 1 }).lean();
    const subjectMap = new Map(subjects.map(sub => [sub._id.toString(), sub.name]));

    const csvData = [];

    for (const test of tests) {
      const answersheet = answersheets.find(a => a.test.toString() === test._id.toString());
      const subjectNames = test.subjects.map(subjectId => subjectMap.get(subjectId.toString()) || '');
      const testQuestions = test.questions.map((question, index) => ({
        'Question Number': index + 1,
        'Marks': question.marks,
        'Student Answer': answersheet ? answersheet.answers[index] : '',
        'Score': answersheet && Array.isArray(answersheet.score) ? answersheet.score[index] : 0,
      }));

      csvData.push({
        'Test Title': test.title,
        'Test Status': test.status,
        'Max Marks': test.maxmarks,
        'Subjects': subjectNames.join(', '),
        'Score': answersheet ? (Array.isArray(answersheet.score) ? answersheet.score.reduce((a, b) => a + b, 0) : answersheet.score) : 0,
        'Questions': test.questions.length,
      });
    }

    const outputPath = path.join(__dirname, 'output');
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath);
    }

    const csvWriter = createCsvWriter({
      path: path.join(outputPath, 'completed_tests.csv'),
      header: [
        { id: 'Test Title', title: 'Test Title' },
        { id: 'Test Status', title: 'Test Status' },
        { id: 'Max Marks', title: 'Max Marks' },
        { id: 'Subjects', title: 'Subjects' },
        { id: 'Score', title: 'Score' },
        { id: 'Questions', title: 'Questions' },
      ]
    });

    await csvWriter.writeRecords(csvData);
    console.log('CSV file generated: output/completed_tests.csv');
  } catch (err) {
    console.error('Error:', err);
  }
};

module.exports = {
  getUserCompletedTestsCSV
};