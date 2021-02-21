import { SyntheticPlatformEmitter } from '@unimodules/core';
import { PermissionResponse, PermissionStatus } from 'unimodules-permissions-interface';

import { AVPlaybackNativeSource, AVPlaybackStatus, AVPlaybackStatusToSet } from './AV';
import { RECORDING_OPTIONS_PRESET_HIGH_QUALITY } from './Audio/Recording';

const AudioContext = window.AudioContext || (window as any).webkitAudioContext;

const preloadAudios: Record<
  string, // source path
  {
    audio: HTMLAudioElement;
    readyToBeUnloaded: boolean;
  }
> = {};

/**
 * Gets the permission details. The implementation is not very good as it actually requests
 * access to the microhpone, not all browsers support the experimental permissions api
 */
async function getPermissionsAsync(): Promise<PermissionResponse> {
  const resolveWithStatus = (status: PermissionStatus) => ({
    status,
    granted: status === PermissionStatus.GRANTED,
    canAskAgain: true,
    expires: 0,
  });

  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    return resolveWithStatus(PermissionStatus.GRANTED);
  } catch (e) {
    return resolveWithStatus(PermissionStatus.DENIED);
  }
}

function getStatusFromMedia(media?: HTMLMediaElement): AVPlaybackStatus {
  if (!media) {
    return {
      isLoaded: false,
      error: undefined,
    };
  }

  const isPlaying = !!(
    media.currentTime > 0 &&
    !media.paused &&
    !media.ended &&
    media.readyState > 2
  );

  const status: AVPlaybackStatus = {
    isLoaded: true,
    uri: media.src,
    progressUpdateIntervalMillis: 100, //TODO: Bacon: Add interval between calls
    durationMillis: isNaN(media.duration) ? 0 : media.duration * 1000,
    positionMillis: media.currentTime * 1000,
    // playableDurationMillis: media.buffered * 1000,
    // seekMillisToleranceBefore?: number
    // seekMillisToleranceAfter?: number
    shouldPlay: media.autoplay,
    isPlaying,
    isBuffering: false, //media.waiting,
    rate: media.playbackRate,
    // TODO: Bacon: This seems too complicated right now: https://webaudio.github.io/web-audio-api/#dom-biquadfilternode-frequency
    shouldCorrectPitch: false,
    volume: media.volume,
    isMuted: media.muted,
    isLooping: media.loop,
    didJustFinish: media.ended,
  };

  return status;
}

async function setStatusForMedia(
  media: HTMLMediaElement,
  status: AVPlaybackStatusToSet
): Promise<AVPlaybackStatus> {
  if (status.positionMillis !== undefined) {
    media.currentTime = status.positionMillis / 1000;
  }
  if (status.shouldPlay !== undefined) {
    if (status.shouldPlay) {
      await media.play();
    } else {
      media.pause();
    }
  }
  if (status.rate !== undefined) {
    media.playbackRate = status.rate;
  }
  if (status.volume !== undefined) {
    media.volume = status.volume;
  }
  if (status.isMuted !== undefined) {
    media.muted = status.isMuted;
  }
  if (status.isLooping !== undefined) {
    media.loop = status.isLooping;
  }

  return getStatusFromMedia(media);
}

let mediaRecorder: null | any /*MediaRecorder*/ = null;
let mediaRecorderUptimeOfLastStartResume: number = 0;
let mediaRecorderDurationAlreadyRecorded: number = 0;
let mediaRecorderIsRecording: boolean = false;
let audioChunks: Blob[] = [];

let analyser: null | AnalyserNode = null;
const fftSize = 1024;
const timeData = new Uint8Array(fftSize);

function getAudioRecorderDurationMillis() {
  let duration = mediaRecorderDurationAlreadyRecorded;
  if (mediaRecorderIsRecording && mediaRecorderUptimeOfLastStartResume > 0) {
    duration += Date.now() - mediaRecorderUptimeOfLastStartResume;
  }
  return duration;
}

export default {
  get name(): string {
    return 'ExponentAV';
  },
  async getStatusForVideo(element: HTMLMediaElement): Promise<AVPlaybackStatus> {
    return getStatusFromMedia(element);
  },
  async loadForVideo(
    element: HTMLMediaElement,
    nativeSource: AVPlaybackNativeSource,
    fullInitialStatus: AVPlaybackStatusToSet
  ): Promise<AVPlaybackStatus> {
    return getStatusFromMedia(element);
  },
  async unloadForVideo(element: HTMLMediaElement): Promise<AVPlaybackStatus> {
    return getStatusFromMedia(element);
  },
  async setStatusForVideo(
    element: HTMLMediaElement,
    status: AVPlaybackStatusToSet
  ): Promise<AVPlaybackStatus> {
    return setStatusForMedia(element, status);
  },
  async replayVideo(
    element: HTMLMediaElement,
    status: AVPlaybackStatusToSet
  ): Promise<AVPlaybackStatus> {
    return setStatusForMedia(element, status);
  },
  /* Audio */
  async setAudioMode() {},
  async setAudioIsEnabled() {},
  async getStatusForSound(element: HTMLMediaElement) {
    return getStatusFromMedia(element);
  },
  async preloadForSound(nativeSource: string | { uri: string; [key: string]: any }) {
    const source = typeof nativeSource === 'string' ? nativeSource : nativeSource.uri;

    const audio = new Audio(source);
    await audio.play();
    audio.pause();
    audio.currentTime = 0;

    preloadAudios[source] = {
      audio,
      readyToBeUnloaded: true,
    };
  },
  async loadForSound(
    nativeSource: string | { uri: string; [key: string]: any },
    fullInitialStatus: AVPlaybackStatusToSet
  ): Promise<[HTMLMediaElement, AVPlaybackStatus]> {
    const source = typeof nativeSource === 'string' ? nativeSource : nativeSource.uri;
    const media = source in preloadAudios ? preloadAudios[source].audio : new Audio(source);

    if (source in preloadAudios) {
      preloadAudios[source].readyToBeUnloaded = false;
    }

    media.ontimeupdate = () => {
      SyntheticPlatformEmitter.emit('didUpdatePlaybackStatus', {
        key: media,
        status: getStatusFromMedia(media),
      });
    };

    media.onloadedmetadata = () => {
      SyntheticPlatformEmitter.emit('didUpdatePlaybackStatus', {
        key: media,
        status: getStatusFromMedia(media),
      });
    };

    media.onerror = () => {
      SyntheticPlatformEmitter.emit('ExponentAV.onError', {
        key: media,
        error: media.error!.message,
      });
    };

    const status = await setStatusForMedia(media, fullInitialStatus);

    return [media, status];
  },
  async unloadForSound(element: HTMLMediaElement) {
    const source = element.getAttribute('src');

    // keep the sound loaded for assets that have been preloaded
    if (source && source in preloadAudios) {
      preloadAudios[source].readyToBeUnloaded = true;
      element.currentTime = 0;
      return getStatusFromMedia(element);
    }

    element.pause();
    element.removeAttribute('src');
    element.load();
    return getStatusFromMedia(element);
  },
  async setStatusForSound(
    element: HTMLMediaElement,
    status: AVPlaybackStatusToSet
  ): Promise<AVPlaybackStatus> {
    return setStatusForMedia(element, status);
  },
  async replaySound(
    element: HTMLMediaElement,
    status: AVPlaybackStatusToSet
  ): Promise<AVPlaybackStatus> {
    return setStatusForMedia(element, status);
  },

  /* Recording */
  //   async setUnloadedCallbackForAndroidRecording() {},
  async getAudioRecordingStatus() {
    let volumeLevel = 0;
    let float = 0;
    let total = 0;
    let i = 0;
    let rms = 0;

    if (analyser) {
      analyser.getByteTimeDomainData(timeData);
      while (i < fftSize) {
        float = timeData[i++] / 0x80 - 1;
        total += float * float;
      }

      rms = Math.sqrt(total / fftSize);

      volumeLevel = 20 * (Math.log(rms) / Math.log(10));
      // sanity check
      volumeLevel = Math.max(-48, Math.min(volumeLevel, 0));
    }

    return {
      canRecord: mediaRecorder?.state === 'recording' || mediaRecorder?.state === 'inactive',
      isRecording: mediaRecorder?.state === 'recording',
      isDoneRecording: false,
      durationMillis: getAudioRecorderDurationMillis(),
      _currentMetering: volumeLevel,
    };
  },
  async prepareAudioRecorder(options) {
    if (typeof navigator !== 'undefined' && !navigator.mediaDevices) {
      throw new Error('No media devices available');
    }

    mediaRecorderUptimeOfLastStartResume = 0;
    mediaRecorderDurationAlreadyRecorded = 0;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    mediaRecorder = new (window as any).MediaRecorder(
      stream,
      options?.web || RECORDING_OPTIONS_PRESET_HIGH_QUALITY.web
    );

    mediaRecorder.addEventListener('pause', () => {
      mediaRecorderDurationAlreadyRecorded = getAudioRecorderDurationMillis();
      mediaRecorderIsRecording = false;
    });

    mediaRecorder.addEventListener('resume', () => {
      mediaRecorderUptimeOfLastStartResume = Date.now();
      mediaRecorderIsRecording = true;
    });

    mediaRecorder.addEventListener('start', () => {
      mediaRecorderUptimeOfLastStartResume = Date.now();
      mediaRecorderDurationAlreadyRecorded = 0;
      mediaRecorderIsRecording = true;
    });

    mediaRecorder.addEventListener('stop', () => {
      mediaRecorderDurationAlreadyRecorded = getAudioRecorderDurationMillis();
      mediaRecorderIsRecording = false;

      // Clears recording icon in Chrome tab
      stream.getTracks().forEach(track => track.stop());
    });

    audioChunks = [];

    const audioContext = new AudioContext();
    const microphone = audioContext.createMediaStreamSource(stream);

    analyser = audioContext.createAnalyser();
    microphone.connect(analyser);
    analyser.fftSize = fftSize;

    return { uri: null, status: await this.getAudioRecordingStatus() };
  },
  async startAudioRecording() {
    if (mediaRecorder === null) {
      throw new Error(
        'Cannot start an audio recording without initializing a MediaRecorder. Run prepareToRecordAsync() before attempting to start an audio recording.'
      );
    }

    if (mediaRecorder.state === 'paused') {
      mediaRecorder.resume();
    } else {
      mediaRecorder.start();

      mediaRecorder.addEventListener('dataavailable', event => {
        audioChunks.push(event.data);
      });
    }

    return this.getAudioRecordingStatus();
  },
  async pauseAudioRecording() {
    if (mediaRecorder === null) {
      throw new Error(
        'Cannot start an audio recording without initializing a MediaRecorder. Run prepareToRecordAsync() before attempting to start an audio recording.'
      );
    }

    // Set status to paused
    mediaRecorder.pause();

    return this.getAudioRecordingStatus();
  },
  async stopAudioRecording() {
    if (mediaRecorder === null) {
      throw new Error(
        'Cannot start an audio recording without initializing a MediaRecorder. Run prepareToRecordAsync() before attempting to start an audio recording.'
      );
    }

    if (mediaRecorder.state === 'inactive') {
      return { uri: null, status: await this.getAudioRecordingStatus() };
    }

    const objectUrl = new Promise(resolve => {
      mediaRecorder.addEventListener('stop', () => {
        const url = URL.createObjectURL(new Blob(audioChunks));
        resolve(url);
      });
    });

    await mediaRecorder.stop();
    const url = await objectUrl;

    return { uri: url, status: await this.getAudioRecordingStatus() };
  },
  async unloadAudioRecorder() {
    mediaRecorder = null;
    analyser = null;
    return this.getAudioRecordingStatus();
  },

  getPermissionsAsync,
  async requestPermissionsAsync(): Promise<PermissionResponse> {
    return getPermissionsAsync();
  },
};
