import 'dotenv/config';
import { app } from './app';

const PORT = process.env.PORT ?? 3001;

// Listen on :: (IPv6 dual-stack) so both 127.0.0.1 and ::1 connections work.
// WebView2 on Windows may resolve "localhost" to ::1 rather than 127.0.0.1.
app.listen(Number(PORT), '::', () => {
  console.log(`POS API running on port ${PORT}`);
});
