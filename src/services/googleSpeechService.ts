import { Platform } from 'react-native';

const API_KEY = process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyA2isAsEPj2go-KseGbjvVLEQIPDhNGspE';

export interface SpeechRecognitionResult {
  success: boolean;
  text?: string;
  error?: string;
  errorCode?: string;
}

class GoogleSpeechRecorder {
  private mediaRecorder: any = null;
  private audioChunks: any[] = [];
  private mediaStream: any = null;
  private sampleRate: number = 48000;
  private mimeType: string = 'audio/webm;codecs=opus';

  async startRecording(): Promise<{ success: boolean; error?: string }> {
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return { success: false, error: 'MediaDevices not supported on this platform' };
    }

    try {
      this.audioChunks = [];
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 48000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      this.mediaStream = stream;

      const track = stream.getAudioTracks()[0];
      if (track) {
        const settings = track.getSettings();
        if (settings.sampleRate) {
          this.sampleRate = settings.sampleRate;
        }
      }

      // Determine supported mimeType on this browser
      const types = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
      ];
      let selectedType = '';
      for (const t of types) {
        if ((window as any).MediaRecorder?.isTypeSupported?.(t)) {
          selectedType = t;
          break;
        }
      }
      this.mimeType = selectedType || 'audio/webm';

      const recorder = new (window as any).MediaRecorder(stream, {
        mimeType: this.mimeType,
      });

      recorder.ondataavailable = (event: any) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder = recorder;
      recorder.start(100);
      return { success: true };
    } catch (err: any) {
      console.error('Failed to start recording:', err);
      return { success: false, error: err?.message || 'Permission denied' };
    }
  }

  async stopAndTranscribe(language: 'hi' | 'en' = 'hi'): Promise<SpeechRecognitionResult> {
    if (!this.mediaRecorder) {
      return { success: false, error: 'No active recording' };
    }

    return new Promise<SpeechRecognitionResult>((resolve) => {
      this.mediaRecorder.onstop = async () => {
        try {
          // Release microphone hardware immediately
          if (this.mediaStream) {
            this.mediaStream.getTracks().forEach((t: any) => t.stop());
            this.mediaStream = null;
          }

          if (this.audioChunks.length === 0) {
            resolve({ success: false, error: 'NO_SPEECH_DETECTED' });
            return;
          }

          const blob = new Blob(this.audioChunks, { type: this.mimeType });
          const base64Audio = await this.blobToBase64(blob);

          if (!base64Audio) {
            resolve({ success: false, error: 'Audio encoding failed' });
            return;
          }

          const result = await this.callGoogleSpeechApi(base64Audio, language);
          resolve(result);
        } catch (err: any) {
          console.error('Transcription error:', err);
          resolve({ success: false, error: err?.message || 'Transcription failed' });
        } finally {
          this.mediaRecorder = null;
          this.audioChunks = [];
        }
      };

      try {
        if (this.mediaRecorder.state !== 'inactive') {
          this.mediaRecorder.stop();
        } else {
          resolve({ success: false, error: 'Recorder not active' });
        }
      } catch (e: any) {
        resolve({ success: false, error: e?.message });
      }
    });
  }

  cancelRecording(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t: any) => t.stop());
      this.mediaStream = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {}
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(',')[1];
        resolve(base64 || '');
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private async callGoogleSpeechApi(
    base64Audio: string,
    language: 'hi' | 'en'
  ): Promise<SpeechRecognitionResult> {
    if (!API_KEY) {
      return { success: false, error: 'Google Cloud API key not configured' };
    }

    const url = `https://speech.googleapis.com/v1/speech:recognize?key=${API_KEY}`;

    let encoding = 'WEBM_OPUS';
    if (this.mimeType.includes('ogg')) {
      encoding = 'OGG_OPUS';
    } else if (this.mimeType.includes('mp4')) {
      encoding = 'ENCODING_UNSPECIFIED';
    }

    let validSampleRate = 48000;
    if ([8000, 12000, 16000, 24000, 48000].includes(this.sampleRate)) {
      validSampleRate = this.sampleRate;
    }

    const payload = {
      config: {
        encoding: encoding,
        sampleRateHertz: validSampleRate,
        languageCode: language === 'hi' ? 'hi-IN' : 'en-IN',
        alternativeLanguageCodes: language === 'hi' ? ['en-IN'] : ['hi-IN'],
        enableAutomaticPunctuation: false,
        model: 'default',
      },
      audio: {
        content: base64Audio,
      },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data?.error?.message || 'Google Cloud Speech request failed';
        const errorCode = data?.error?.status || 'ERROR';
        return { success: false, error: errorMsg, errorCode };
      }

      if (data.results && data.results.length > 0) {
        const transcript = data.results
          .map((r: any) => r.alternatives?.[0]?.transcript || '')
          .filter(Boolean)
          .join(' ')
          .trim();

        if (transcript) {
          return { success: true, text: transcript };
        }
      }

      return { success: false, error: 'NO_SPEECH_DETECTED' };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Network error connecting to Google Speech',
      };
    }
  }
}

export const googleSpeechRecorder = new GoogleSpeechRecorder();
