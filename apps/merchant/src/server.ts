import app from './app.js';
const port = Number(process.env.PORT ?? '8402');
app.listen(port, () => { process.stdout.write(`HuFu merchant listening on ${port}\n`); });
