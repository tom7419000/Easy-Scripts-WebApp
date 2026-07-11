/**
 * Server-Sent-Events bus for real-time updates in the admin panel and on the
 * public page (e.g. a script was activated -> tiles refresh instantly).
 */
export class EventBus {
  constructor() {
    this.clients = new Set();
    const timer = setInterval(() => this._heartbeat(), 25000);
    timer.unref?.();
  }

  subscribe(req, res, channel) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    const client = { res, channel };
    this.clients.add(client);
    req.on('close', () => this.clients.delete(client));
  }

  _heartbeat() {
    for (const client of this.clients) {
      try { client.res.write(': ping\n\n'); } catch { this.clients.delete(client); }
    }
  }

  /** Publish an event to 'admin', 'public' or 'all' subscribers. */
  publish(event, data = {}, channel = 'all') {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) {
      if (channel !== 'all' && client.channel !== channel && client.channel !== 'admin') continue;
      try { client.res.write(payload); } catch { this.clients.delete(client); }
    }
  }
}
