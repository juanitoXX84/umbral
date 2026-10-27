import { AudioModule, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from "expo-audio";

const backgroundMode = {
  allowsRecording: true,
  playsInSilentMode: true,
  shouldPlayInBackground: true,
  allowsBackgroundRecording: true,
  interruptionMode: "doNotMix" as const,
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openRecorder(background: boolean) {
  await setAudioModeAsync(background ? backgroundMode : { ...backgroundMode, allowsBackgroundRecording: false });
  const recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
  await recorder.prepareToRecordAsync();
  return recorder;
}

export async function recordClip(seconds: number, onTick: (left: number) => void): Promise<string | null> {
  const permission = await requestRecordingPermissionsAsync();
  if (!permission.granted) return null;

  let background = true;
  let recorder;
  try {
    recorder = await openRecorder(true);
    recorder.record({ forDuration: seconds });
  } catch {
    background = false;
    recorder = await openRecorder(false);
    recorder.record({ forDuration: seconds });
    // The microphone service is missing in Expo Go. Keeping this flag on stops the recorder from pausing when the app leaves the screen.
    await setAudioModeAsync(backgroundMode).catch(() => {});
  }

  const started = Date.now();
  const limit = background ? (seconds + 3) * 1000 : 90000;
  let sawRecording = false;
  while (Date.now() - started < limit) {
    const status = recorder.getStatus();
    if (status.isRecording) sawRecording = true;
    const recorded = Math.max(status.durationMillis / 1000, recorder.currentTime || 0);
    onTick(Math.max(0, Math.ceil(seconds - recorded)));
    if (recorded >= seconds) break;
    if (sawRecording && !status.isRecording && recorded > 0.3) break;
    await wait(400);
  }

  if (recorder.getStatus().isRecording || recorder.isRecording) {
    await recorder.stop().catch(() => {});
  }
  return recorder.uri ?? recorder.getStatus().url;
}
