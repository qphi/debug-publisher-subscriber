import type { PublisherInterface } from "@qphi/publisher-subscriber";
import { Publisher, Subscriber } from "@qphi/publisher-subscriber";
type HistoryEntry = {
    at?: Date;
    index: number;
    kind: string;
    message: string;
    payload: any;
};
export declare class PubSubManager {
    private publishers;
    private subscribers;
    private proxy;
    private history;
    private dedicatedHistory;
    recordPublisher(publisher: PublisherInterface): void;
    private updateDedicatedHistoryEntry;
    private removePublisher;
    private removeSubscriber;
    private beforePublish;
    private onSubscribe;
    private updateHistory;
    recordSubscribers(subscriber: TimelineSubscriber): void;
    getHistory(): HistoryEntry[];
    getHistoryFor(id: string): HistoryEntry[];
}
export declare class TimelinePublisher extends Publisher {
    constructor(id: string);
    publish(notification: string, data?: any): void;
    destroy(): void;
}
export declare class TimelineSubscriber extends Subscriber {
    private proxy;
    constructor(id: string);
    getProxy(): PublisherInterface;
    recordSubscription(subscriptionId: string, notification: string): void;
    destroy(): void;
}
export {};
//# sourceMappingURL=index.d.ts.map