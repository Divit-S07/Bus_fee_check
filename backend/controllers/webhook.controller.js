const { TravelService } = require('../services/travel.service');

const handleRecognition = async (req, res) => {
  try {
    const { eventId, timestamp, busId, studentId, confidenceScore, recognitionStatus, imageHash, modelVersion, location } = req.body;
    if (!busId || !studentId || !confidenceScore) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    const result = await TravelService.processRecognitionEvent({
      eventId,
      timestamp: new Date(timestamp),
      busId,
      studentId,
      confidenceScore,
      recognitionStatus,
      imageHash,
      modelVersion,
      location: {
        latitude: location.latitude,
        longitude: location.longitude,
      },
    });
    res.json({ status: 'success', ...result });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = { handleRecognition };