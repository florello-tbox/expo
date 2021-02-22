import { PermissionResponse } from 'unimodules-permissions-interface';
import { AVPlaybackNativeSource, AVPlaybackStatus, AVPlaybackStatusToSet } from './AV';
/**
 * Gets the permission details. The implementation is not very good as it actually requests
 * access to the microhpone, not all browsers support the experimental permissions api
 */
declare function getPermissionsAsync(): Promise<PermissionResponse>;
declare const _default: {
    readonly name: string;
    getStatusForVideo(element: HTMLMediaElement): Promise<AVPlaybackStatus>;
    loadForVideo(element: HTMLMediaElement, nativeSource: AVPlaybackNativeSource, fullInitialStatus: AVPlaybackStatusToSet): Promise<AVPlaybackStatus>;
    unloadForVideo(element: HTMLMediaElement): Promise<AVPlaybackStatus>;
    setStatusForVideo(element: HTMLMediaElement, status: AVPlaybackStatusToSet): Promise<AVPlaybackStatus>;
    replayVideo(element: HTMLMediaElement, status: AVPlaybackStatusToSet): Promise<AVPlaybackStatus>;
    setAudioMode(): Promise<void>;
    setAudioIsEnabled(): Promise<void>;
    getStatusForSound(element: HTMLMediaElement): Promise<AVPlaybackStatus>;
    loadForSound(nativeSource: string | {
        [key: string]: any;
        uri: string;
    }, fullInitialStatus: AVPlaybackStatusToSet): Promise<[HTMLMediaElement, AVPlaybackStatus]>;
    unloadForSound(element: HTMLMediaElement): Promise<AVPlaybackStatus>;
    setStatusForSound(element: HTMLMediaElement, status: AVPlaybackStatusToSet): Promise<AVPlaybackStatus>;
    replaySound(element: HTMLMediaElement, status: AVPlaybackStatusToSet): Promise<AVPlaybackStatus>;
    getAudioRecordingStatus(): Promise<{
        canRecord: boolean;
        isRecording: boolean;
        isDoneRecording: boolean;
        durationMillis: number;
        _currentMetering: number;
    }>;
    prepareAudioRecorder(options: any): Promise<{
        uri: null;
        status: {
            canRecord: boolean;
            isRecording: boolean;
            isDoneRecording: boolean;
            durationMillis: number;
            _currentMetering: number;
        };
    }>;
    startAudioRecording(): Promise<{
        canRecord: boolean;
        isRecording: boolean;
        isDoneRecording: boolean;
        durationMillis: number;
        _currentMetering: number;
    }>;
    pauseAudioRecording(): Promise<{
        canRecord: boolean;
        isRecording: boolean;
        isDoneRecording: boolean;
        durationMillis: number;
        _currentMetering: number;
    }>;
    stopAudioRecording(): Promise<{
        uri: unknown;
        status: {
            canRecord: boolean;
            isRecording: boolean;
            isDoneRecording: boolean;
            durationMillis: number;
            _currentMetering: number;
        };
    }>;
    unloadAudioRecorder(): Promise<{
        canRecord: boolean;
        isRecording: boolean;
        isDoneRecording: boolean;
        durationMillis: number;
        _currentMetering: number;
    }>;
    getPermissionsAsync: typeof getPermissionsAsync;
    requestPermissionsAsync(): Promise<PermissionResponse>;
};
export default _default;
