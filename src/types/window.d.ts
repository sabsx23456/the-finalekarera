export { };

declare global {
    interface Window {
        cardano?: {
            eternl?: any;
            [key: string]: any;
        };
    }
}
