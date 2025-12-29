// Client-side encryption utilities for E2EE task storage
// Uses Web Crypto API with AES-GCM encryption

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const ITERATIONS = 100000; // PBKDF2 iterations

// Storage keys
const ENCRYPTION_KEY_STORAGE = 'tasker_encryption_key';
const SALT_STORAGE = 'tasker_salt';

// Check if Web Crypto API is available
function isCryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && 
         typeof crypto.subtle !== 'undefined' &&
         typeof crypto.getRandomValues !== 'undefined';
}

// Get crypto.subtle with error handling
function getCryptoSubtle(): SubtleCrypto {
  if (!isCryptoAvailable()) {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    
    if (protocol === 'http:' && !isLocalhost) {
      throw new Error(
        'Web Crypto API is not available. ' +
        'Please access the app via HTTPS or use localhost. ' +
        `Current URL: ${protocol}//${hostname}${window.location.port ? ':' + window.location.port : ''}`
      );
    } else {
      throw new Error('Web Crypto API is not available in this browser or context.');
    }
  }
  return crypto.subtle;
}

// Convert ArrayBuffer to Base64 string
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert Base64 string to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Generate a random salt
export function generateSalt(): string {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return arrayBufferToBase64(salt.buffer);
}

// Derive encryption key from password and salt using PBKDF2
async function deriveKey(password: string, salt: string): Promise<CryptoKey> {
  const subtle = getCryptoSubtle();
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  const saltBuffer = base64ToArrayBuffer(salt);

  // Import password as key material
  const keyMaterial = await subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Derive AES key from password
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    true, // extractable for storage
    ['encrypt', 'decrypt']
  );
}

// Store encryption key in localStorage (persists across sessions)
// Note: This is a trade-off between UX and security
// The key is derived from the password, so it's still protected
async function storeKey(key: CryptoKey): Promise<void> {
  const subtle = getCryptoSubtle();
  const exported = await subtle.exportKey('raw', key);
  const keyString = arrayBufferToBase64(exported);
  localStorage.setItem(ENCRYPTION_KEY_STORAGE, keyString);
}

// Retrieve stored encryption key
async function getStoredKey(): Promise<CryptoKey | null> {
  if (!isCryptoAvailable()) return null;
  
  const keyString = localStorage.getItem(ENCRYPTION_KEY_STORAGE);
  if (!keyString) return null;

  try {
    const subtle = getCryptoSubtle();
    const keyBuffer = base64ToArrayBuffer(keyString);
    return subtle.importKey(
      'raw',
      keyBuffer,
      { name: ALGORITHM, length: KEY_LENGTH },
      false,
      ['encrypt', 'decrypt']
    );
  } catch {
    return null;
  }
}

// Store salt in localStorage (persists across sessions)
export function storeSalt(salt: string): void {
  localStorage.setItem(SALT_STORAGE, salt);
}

// Get stored salt
export function getStoredSalt(): string | null {
  return localStorage.getItem(SALT_STORAGE);
}

// Initialize encryption with password and salt
export async function initializeEncryption(password: string, salt: string): Promise<void> {
  const key = await deriveKey(password, salt);
  await storeKey(key);
  storeSalt(salt);
}

// Clear encryption key (on logout)
export function clearEncryption(): void {
  localStorage.removeItem(ENCRYPTION_KEY_STORAGE);
  // Don't clear salt - user might log back in
}

// Check if encryption is initialized
export function isEncryptionReady(): boolean {
  return localStorage.getItem(ENCRYPTION_KEY_STORAGE) !== null;
}

// Encrypt text
export async function encryptText(plaintext: string): Promise<string> {
  if (!isCryptoAvailable()) {
    throw new Error('Web Crypto API is not available. Encryption cannot be performed.');
  }
  
  const key = await getStoredKey();
  if (!key) {
    throw new Error('Encryption not initialized. Please log in again.');
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  
  // Generate random IV for each encryption
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const subtle = getCryptoSubtle();
  const encrypted = await subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    data
  );

  // Combine IV + encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return arrayBufferToBase64(combined.buffer);
}

// Check if a string looks like encrypted data (base64, typically longer than normal text)
function looksLikeEncrypted(text: string): boolean {
  // Encrypted data is base64, typically longer and matches base64 pattern
  if (text.length < 20) return false; // Too short to be encrypted
  
  // Check if it's valid base64
  try {
    const decoded = atob(text);
    // Encrypted data should have at least 12 bytes (IV) + some encrypted content
    return decoded.length >= 12;
  } catch {
    return false; // Not valid base64
  }
}

// Decrypt text
export async function decryptText(ciphertext: string): Promise<string> {
  if (!isCryptoAvailable()) {
    // If crypto is not available but data looks encrypted, show a helpful message
    if (isEncryptionReady() && looksLikeEncrypted(ciphertext)) {
      return '[🔒 Encrypted - Please use HTTPS or localhost to decrypt]';
    }
    // Otherwise return as-is (might be unencrypted legacy data)
    return ciphertext;
  }
  
  const key = await getStoredKey();
  if (!key) {
    // If we have encrypted data but no key, show a message
    if (looksLikeEncrypted(ciphertext)) {
      return '[🔒 Encrypted - Please log in to decrypt]';
    }
    // Otherwise return as-is (might be unencrypted legacy data)
    return ciphertext;
  }

  try {
    const combined = new Uint8Array(base64ToArrayBuffer(ciphertext));
    
    // Extract IV and encrypted data
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);

    const subtle = getCryptoSubtle();
    const decrypted = await subtle.decrypt(
      { name: ALGORITHM, iv },
      key,
      encrypted
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch {
    // If decryption fails but it looks encrypted, show a message
    if (looksLikeEncrypted(ciphertext)) {
      return '[🔒 Decryption failed - Data may be corrupted]';
    }
    // Return original if decryption fails (might be unencrypted legacy data)
    return ciphertext;
  }
}

// Encrypt task object (only encrypts text field)
export async function encryptTask<T extends { text: string }>(task: T): Promise<T> {
  if (!isEncryptionReady()) return task;
  
  return {
    ...task,
    text: await encryptText(task.text),
  };
}

// Decrypt task object (only decrypts text field)
export async function decryptTask<T extends { text: string }>(task: T): Promise<T> {
  if (!isEncryptionReady()) return task;
  
  return {
    ...task,
    text: await decryptText(task.text),
  };
}

// Decrypt array of tasks
export async function decryptTasks<T extends { text: string }>(tasks: T[]): Promise<T[]> {
  if (!isEncryptionReady()) return tasks;
  
  return Promise.all(tasks.map(decryptTask));
}

