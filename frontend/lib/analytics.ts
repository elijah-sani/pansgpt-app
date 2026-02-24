// Analytics stub — replace with real provider (GA4, Mixpanel, etc.) as needed
const noop = (..._args: any[]) => { };

export const analytics = {
    track: (event: string, properties?: Record<string, any>) => {
        if (process.env.NODE_ENV === 'development') {
            console.debug('[analytics]', event, properties);
        }
    },
    trackLoginClick: (source: string) => {
        if (process.env.NODE_ENV === 'development') {
            console.debug('[analytics] loginClick', source);
        }
    },
    trackSignUpClick: (source: string) => {
        if (process.env.NODE_ENV === 'development') {
            console.debug('[analytics] signUpClick', source);
        }
    },
    trackDownloadClick: (source: string) => {
        if (process.env.NODE_ENV === 'development') {
            console.debug('[analytics] downloadClick', source);
        }
    },
    trackPageView: noop,
    trackEvent: noop,
};
