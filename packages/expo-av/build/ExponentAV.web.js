import { SyntheticPlatformEmitter } from '@unimodules/core';
import { PermissionStatus } from 'unimodules-permissions-interface';
import { RECORDING_OPTIONS_PRESET_HIGH_QUALITY } from './Audio/Recording';
/**
 * Gets the permission details. The implementation is not very good as it actually requests
 * access to the microhpone, not all browsers support the experimental permissions api
 */
async function getPermissionsAsync() {
    const resolveWithStatus = (status) => ({
        status,
        granted: status === PermissionStatus.GRANTED,
        canAskAgain: true,
        expires: 0,
    });
    try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        return resolveWithStatus(PermissionStatus.GRANTED);
    }
    catch (e) {
        return resolveWithStatus(PermissionStatus.DENIED);
    }
}
function getStatusFromMedia(media) {
    if (!media) {
        return {
            isLoaded: false,
            error: undefined,
        };
    }
    const isPlaying = !!(media.currentTime > 0 &&
        !media.paused &&
        !media.ended &&
        media.readyState > 2);
    const status = {
        isLoaded: true,
        uri: media.src,
        progressUpdateIntervalMillis: 100,
        durationMillis: isNaN(media.duration) ? 0 : media.duration * 1000,
        positionMillis: media.currentTime * 1000,
        // playableDurationMillis: media.buffered * 1000,
        // seekMillisToleranceBefore?: number
        // seekMillisToleranceAfter?: number
        shouldPlay: media.autoplay,
        isPlaying,
        isBuffering: false,
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
function setStatusForMedia(media, status) {
    if (status.positionMillis !== undefined) {
        media.currentTime = status.positionMillis / 1000;
    }
    // if (status.progressUpdateIntervalMillis !== undefined) {
    //   media.progressUpdateIntervalMillis = status.progressUpdateIntervalMillis;
    // }
    // if (status.seekMillisToleranceBefore !== undefined) {
    //   media.seekMillisToleranceBefore = status.seekMillisToleranceBefore;
    // }
    // if (status.seekMillisToleranceAfter !== undefined) {
    //   media.seekMillisToleranceAfter = status.seekMillisToleranceAfter;
    // }
    // if (status.shouldCorrectPitch !== undefined) {
    //   media.shouldCorrectPitch = status.shouldCorrectPitch;
    // }
    if (status.shouldPlay !== undefined) {
        if (status.shouldPlay) {
            media.play();
        }
        else {
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
let mediaRecorder = null;
let mediaRecorderUptimeOfLastStartResume = 0;
let mediaRecorderDurationAlreadyRecorded = 0;
let mediaRecorderIsRecording = false;
let audioChunks = [];
let analyser = null;
let fftSize = 1024;
let timeData = new Uint8Array(fftSize);
function getAudioRecorderDurationMillis() {
    let duration = mediaRecorderDurationAlreadyRecorded;
    if (mediaRecorderIsRecording && mediaRecorderUptimeOfLastStartResume > 0) {
        duration += Date.now() - mediaRecorderUptimeOfLastStartResume;
    }
    return duration;
}
export default {
    get name() {
        return 'ExponentAV';
    },
    async getStatusForVideo(element) {
        return getStatusFromMedia(element);
    },
    async loadForVideo(element, nativeSource, fullInitialStatus) {
        return getStatusFromMedia(element);
    },
    async unloadForVideo(element) {
        return getStatusFromMedia(element);
    },
    async setStatusForVideo(element, status) {
        return setStatusForMedia(element, status);
    },
    async replayVideo(element, status) {
        return setStatusForMedia(element, status);
    },
    /* Audio */
    async setAudioMode() { },
    async setAudioIsEnabled() { },
    async getStatusForSound(element) {
        return getStatusFromMedia(element);
    },
    async loadForSound(nativeSource, fullInitialStatus) {
        const source = typeof nativeSource === 'string' ? nativeSource : nativeSource.uri;
        const media = new Audio(source);
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
                error: media.error.message,
            });
        };
        const status = setStatusForMedia(media, fullInitialStatus);
        return [media, status];
    },
    async unloadForSound(element) {
        element.pause();
        element.removeAttribute('src');
        element.load();
        return getStatusFromMedia(element);
    },
    async setStatusForSound(element, status) {
        return setStatusForMedia(element, status);
    },
    async replaySound(element, status) {
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
                float = (timeData[i++] / 0x80) - 1;
                total += (float * float);
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
        mediaRecorder = new window.MediaRecorder(stream, options?.web || RECORDING_OPTIONS_PRESET_HIGH_QUALITY.web);
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
        const AudioContext = window.AudioContext // default
            || window.webkitAudioContext; // safari and old versions of Chrome
        const audioContext = new AudioContext();
        const microphone = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        microphone.connect(analyser);
        analyser.fftSize = fftSize;
        //const javascriptNode = audioContext.createScriptProcessor(2048, 1, 1);
        //analyser.connect(javascriptNode);
        //javascriptNode.connect(audioContext.destination);
        /*javascriptNode.onaudioprocess = () => {
          const array = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(array);
          let values = 0;
    
          const length = array.length;
          for (let i = 0; i < length; i++) {
            values += array[i];
          }
    
          volumeLevel = values / length;
        };*/
        return { uri: null, status: await this.getAudioRecordingStatus() };
    },
    async startAudioRecording() {
        if (mediaRecorder === null) {
            throw new Error('Cannot start an audio recording without initializing a MediaRecorder. Run prepareToRecordAsync() before attempting to start an audio recording.');
        }
        if (mediaRecorder.state === 'paused') {
            mediaRecorder.resume();
        }
        else {
            mediaRecorder.start();
            mediaRecorder.addEventListener('dataavailable', event => {
                audioChunks.push(event.data);
            });
        }
        return this.getAudioRecordingStatus();
    },
    async pauseAudioRecording() {
        if (mediaRecorder === null) {
            throw new Error('Cannot start an audio recording without initializing a MediaRecorder. Run prepareToRecordAsync() before attempting to start an audio recording.');
        }
        // Set status to paused
        mediaRecorder.pause();
        return this.getAudioRecordingStatus();
    },
    async stopAudioRecording() {
        if (mediaRecorder === null) {
            throw new Error('Cannot start an audio recording without initializing a MediaRecorder. Run prepareToRecordAsync() before attempting to start an audio recording.');
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
    async requestPermissionsAsync() {
        return getPermissionsAsync();
    },
};
//# sourceMappingURL=ExponentAV.web.js.map