"use client";

export type TorchTrack = MediaStreamTrack & {
  getCapabilities?: () => MediaTrackCapabilities & { torch?: boolean };
};

export function getVideoTrack(stream: MediaStream | null) {
  return stream?.getVideoTracks()[0] as TorchTrack | undefined;
}

export function supportsTorch(track?: TorchTrack, allowTorch = false) {
  if (!allowTorch || !track?.getCapabilities) return false;
  const capabilities = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
  return Boolean(capabilities.torch);
}

export async function setTorch(track: TorchTrack | undefined, enabled: boolean) {
  if (!track) return false;
  await track.applyConstraints({ advanced: [{ torch: enabled } as MediaTrackConstraintSet] });
  return true;
}

export function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      // Track may already be stopped by the browser.
    }
  });
}
