// App configuration for Visa Interview Agent
export interface AppConfig {
  name: string;
  logo?: string;
  supportsVideoInput: boolean;
  supportsScreenShare: boolean;
  startButtonText: string;
}

export const appConfig: AppConfig = {
  name: "Visa Interview Agent",
  supportsVideoInput: true,
  supportsScreenShare: false,
  startButtonText: "Start Interview",
};
