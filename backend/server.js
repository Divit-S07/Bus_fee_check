const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const { connectDB } = require('./config/database');
const routes = require('./routes');
const { initSocket } = require('./sockets');
const { errorHandler } = require('./utils/errorHandler');

dotenv.config();

const app = express();
const server = http.createServer(app);

connectDB();

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || '*',
  credentials: true,
}));

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW),
  max: parseInt(process.env.RATE_LIMIT_MAX),
});
app.use('/api', limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/v1', routes);
app.use(errorHandler);

initSocket(server);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});