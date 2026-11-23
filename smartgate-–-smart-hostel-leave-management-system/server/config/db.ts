import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import { MongoMemoryServer } from 'mongodb-memory-server';

let memoryServer: MongoMemoryServer | null = null;
let isConnected = false;
let connectionPromise: Promise<void> | null = null;

mongoose.connection.on('connected', () => {
  isConnected = true;
});
mongoose.connection.on('disconnected', () => {
  isConnected = false;
});

async function disconnectMongoose(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  isConnected = false;
}

async function pingMongoose(): Promise<boolean> {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    return false;
  }
  try {
    await mongoose.connection.db.admin().ping();
    return true;
  } catch {
    return false;
  }
}

function isEmbeddedMongoRunning(): boolean {
  const child = memoryServer?.instanceInfo?.instance.mongodProcess;
  return Boolean(child && child.exitCode === null && child.signalCode === null);
}

async function startPersistentMongo(): Promise<string> {
  const dbDir = path.resolve(process.cwd(), '.mongodb-data');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  if (!memoryServer) {
    memoryServer = await MongoMemoryServer.create({
      instance: {
        dbName: 'smartgate',
        dbPath: dbDir,
        storageEngine: 'wiredTiger',
      },
    });
    console.log('[SmartGate DB] Started persistent local MongoDB instance at .mongodb-data');
    return memoryServer.getUri();
  }

  if (memoryServer.state !== 'stopped') {
    await memoryServer.stop({ doCleanup: false });
  }
  await memoryServer.start();
  console.warn('[SmartGate DB] Restarted the persistent local MongoDB instance.');
  return memoryServer.getUri();
}

async function ensureDBConnection(): Promise<void> {
  const configuredUri = process.env.MONGODB_URI?.trim();
  if (configuredUri) {
    if (isConnected && (await pingMongoose())) {
      return;
    }
    await disconnectMongoose();
    await mongoose.connect(configuredUri, {
      dbName: 'smartgate',
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    console.log('[SmartGate DB] Connected to configured MongoDB.');
    return;
  }

  if (memoryServer && isEmbeddedMongoRunning()) {
    const uri = memoryServer.getUri();
    if (isConnected && (await pingMongoose())) {
      return;
    }
    await disconnectMongoose();
    try {
      await mongoose.connect(uri, { dbName: 'smartgate', serverSelectionTimeoutMS: 5000 });
      isConnected = true;
      console.log('[SmartGate DB] Reconnected to persistent local MongoDB.');
      return;
    } catch (error) {
      console.warn('[SmartGate DB] Existing MongoDB process did not accept a connection; restarting it.');
      await disconnectMongoose();
      if (!memoryServer) {
        throw error;
      }
    }
  } else {
    await disconnectMongoose();
  }

  const uri = await startPersistentMongo();
  try {
    await mongoose.connect(uri, {
      dbName: 'smartgate',
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    console.log('[SmartGate DB] Connected to persistent local MongoDB.');
  } catch (error) {
    console.error('[SmartGate DB] MongoDB connection failed.');
    throw error;
  }
}

export async function connectDB(): Promise<void> {
  if (connectionPromise) {
    return connectionPromise;
  }
  connectionPromise = ensureDBConnection();
  try {
    await connectionPromise;
  } finally {
    connectionPromise = null;
  }
}

export async function disconnectDB(): Promise<void> {
  await disconnectMongoose();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}
