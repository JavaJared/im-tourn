import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import app from '../firebase';
const functions = getFunctions(app, 'us-central1');
if (import.meta.env.VITE_USE_EMULATORS === 'true') connectFunctionsEmulator(functions, '127.0.0.1', 5001);
export async function callServer(name, data) {
  const result = await httpsCallable(functions, name)(data);
  return result.data;
}
