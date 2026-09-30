export type TranscriptionErrorCode = "FILE_TOO_LARGE";

export type TranscriptionResult = {
  text: string;
  error?: string;
  errorCode?: TranscriptionErrorCode;
};
