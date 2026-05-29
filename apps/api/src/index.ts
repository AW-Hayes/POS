import 'dotenv/config';
import { app } from './app';

const PORT = process.env.PORT ?? 3001;

// Listen on 0.0.0.0 (IPv4 all-interfaces) so both 127.0.0.1 and LAN connections
// work. WebView2 on Windows uses 127.0.0.1; the old '::' binding only accepted
// IPv6 on Windows (dual-stack is not automatic there).
app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`POS API running on port ${PORT}`);
});
