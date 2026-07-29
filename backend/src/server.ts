import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import emailRoutes from './routes/email.routes';
import { runReconciliation } from './queue/reconciler';
import './queue/emailWorker'; // Import to start the worker

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/emails', emailRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, async () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  // Run startup reconciliation for jobs
  await runReconciliation();
});
