import Peer, { DataConnection } from 'peerjs';

type DataCallback = (data: any) => void;
type StatusCallback = (status: string) => void;

class PeerService {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private onData: DataCallback | null = null;
  private onConnect: (() => void) | null = null;
  private onDisconnect: (() => void) | null = null;

  constructor() {
    this.peer = null;
    this.conn = null;
  }

  // Initialize as Host
  initHost(onOpen: (id: string) => void, onConnect: () => void, onData: DataCallback, onDisconnect: () => void, onError: StatusCallback) {
    this.cleanUp();
    this.onData = onData;
    this.onConnect = onConnect;
    this.onDisconnect = onDisconnect;

    try {
        this.peer = new Peer();

        this.peer.on('open', (id) => {
          onOpen(id);
        });

        this.peer.on('connection', (connection) => {
          this.conn = connection;
          this.setupConnectionHandlers();
        });

        this.peer.on('error', (err) => {
            onError(err.message);
        });
        
        this.peer.on('disconnected', () => {
             // Reconnect logic or notify?
        });

    } catch (err: any) {
        onError(err.message || "Failed to initialize Peer");
    }
  }

  // Initialize as Guest (Joiner)
  initJoin(hostId: string, onConnect: () => void, onData: DataCallback, onDisconnect: () => void, onError: StatusCallback) {
    this.cleanUp();
    this.onData = onData;
    this.onConnect = onConnect;
    this.onDisconnect = onDisconnect;

    try {
        this.peer = new Peer();

        this.peer.on('open', () => {
          if (this.peer) {
            this.conn = this.peer.connect(hostId);
            this.setupConnectionHandlers();
          }
        });

        this.peer.on('error', (err) => {
           onError(err.message);
        });

    } catch (err: any) {
        onError(err.message || "Failed to initialize Peer");
    }
  }

  private setupConnectionHandlers() {
    if (!this.conn) return;

    this.conn.on('open', () => {
      if (this.onConnect) this.onConnect();
    });

    this.conn.on('data', (data) => {
      if (this.onData) this.onData(data);
    });

    this.conn.on('close', () => {
      if (this.onDisconnect) this.onDisconnect();
    });
    
    this.conn.on('error', (err) => {
        console.error("Connection Error", err);
        if (this.onDisconnect) this.onDisconnect();
    })
  }

  send(data: any) {
    if (this.conn && this.conn.open) {
      this.conn.send(data);
    } else {
        console.warn("Connection not open, cannot send");
    }
  }

  cleanUp() {
    if (this.conn) {
      this.conn.close();
    }
    if (this.peer) {
      this.peer.destroy();
    }
    this.peer = null;
    this.conn = null;
  }
}

export const peerService = new PeerService();
