const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const session = require('express-session');
const MongoStore = require('connect-mongo').default;
const passport = require('passport');
require('dotenv').config();
require('./config/passport');

const authRoutes = require('./routes/authRoutes');
const templateRoutes = require('./routes/templateRoutes');
const deploymentRoutes = require('./routes/deploymentRoutes');
const chatRoute = require("./routes/chat");


const app = express();

/* -------------------- TRUST PROXY -------------------- */
app.set('trust proxy', 1); // 🔴 REQUIRED for prod HTTPS

/* -------------------- MIDDLEWARE -------------------- */
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5173",
  credentials: true,
}));

app.use(express.json());

app.use(session({
  name: 'template-hub-session',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,

  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: 'sessions',
  }),

  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000,
  },
}));

/* -------------------- PASSPORT -------------------- */
app.use(passport.initialize());
app.use(passport.session());

/* -------------------- DATABASE -------------------- */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => {
    console.error('MongoDB Connection Error:', err);
    process.exit(1);
  });

/* -------------------- ROUTES -------------------- */
app.use('/auth', authRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/deploy', deploymentRoutes);
app.use("/api/chat", chatRoute);


app.get('/', (req, res) => {
  res.send('Template Hub API is running');
});

/* -------------------- SERVER -------------------- */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
