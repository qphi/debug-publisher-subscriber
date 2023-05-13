import type {PublisherInterface, SubscriptionInterface} from "@qphi/publisher-subscriber";
import {Publisher, Subscriber, SubscriberInterface} from "@qphi/publisher-subscriber";

const GLOBAL_MANAGER_ID: string = '__qphi_pubsub_manager';

type TimelinePublishPayload = {
    publisher: TimelinePublisher,
    notification: string,
    payload: any,
    getTrace?: () => void,
}

type HistoryEntry = {
    at?: Date,
    index: number,
    kind: string,
    message: string,
    payload: any
};

export class PubSubManager {
    private publishers: Map<string, PublisherInterface> = new Map();
    private subscribers: Map<string, SubscriberInterface> = new Map();
    private proxy = new Subscriber(GLOBAL_MANAGER_ID);

    private history: HistoryEntry[] = [];

    private dedicatedHistory: Map<string, HistoryEntry[]> = new Map<string, HistoryEntry[]>()

    public recordPublisher(publisher: PublisherInterface) {
        this.publishers.set(publisher.getId(), publisher);
        this.proxy.subscribe(publisher, 'publish', payload => this.beforePublish(payload));
        this.proxy.subscribe(publisher, 'destroy', () => this.removePublisher(publisher.getId()));

        const trace = new Error('trace');

        this.updateHistory(publisher.getId(), {
            index: this.history.length,
            kind: 'publisher recorded',
            message: `Publisher "${publisher.getId()}" added to manager.`,
            payload: {
                getTrace: () => console.error(trace),
                publisher_id: publisher.getId()
            }
        });
    }

    private updateDedicatedHistoryEntry(pubsubId: string, historyEntry: HistoryEntry): void {
        if (this.dedicatedHistory.has(pubsubId)) {
            let dedicatedHistory = this.dedicatedHistory.get(pubsubId) as HistoryEntry[];
            dedicatedHistory.push(historyEntry);
            this.dedicatedHistory.set(pubsubId, dedicatedHistory);
        } else {
            this.dedicatedHistory.set(pubsubId, [historyEntry]);
        }
    }

    private removePublisher(publisherId: string): void {
        this.publishers.delete(publisherId);

        const historyEntry = {
            index: this.history.length,
            kind: 'publisher removed',
            message: `Publisher "${publisherId}" removed from manager.`,
            payload: {
                publisher_id: publisherId
            }
        }

        this.history.push(historyEntry);
        this.updateDedicatedHistoryEntry(publisherId, historyEntry);
    }

    private removeSubscriber(subscriberId: string): void {
        this.subscribers.delete(subscriberId);


        const trace = new Error('trace');

        this.updateHistory(
            subscriberId,
            {
                index: this.history.length,
                kind: 'subscriber removed',
                message: `Subscriber "${subscriberId}" removed from manager.`,
                payload: {
                    getTrace: () => console.error(trace),
                    subscriber_id: subscriberId
                }
            }
        );
    }

    private beforePublish({publisher, notification, payload, getTrace}: TimelinePublishPayload) {
        console.log('before publish', notification, payload);
        // does not record system notification
        if (notification === 'destroy') {
            return;
        }

        this.updateHistory(
            publisher.getId(),
            {
                index: this.history.length,
                kind: 'publication',
                message: `"${publisher.getId()}" publish "${notification}".`,
                payload: {
                    publisher_id: publisher.getId(),
                    getTrace,
                    notification,
                    payload
                }
            }
        );
    }

    private onSubscribe({subscription, notification}: { subscription: SubscriptionInterface, notification: string }) {
        const decoratedHandler = subscription.handler;
        subscription.handler = (payload) => {
            const trace = new Error('trace');
            this.updateHistory(
                subscription.subscriber_id,
                {
                    index: this.history.length,
                    kind: 'notification received by subscriber',
                    message: `"${subscription.subscriber_id}" receives notification "${notification}" from "${subscription.publisher_id}".`,
                    payload: {
                        publisher_id: subscription.subscriber_id,
                        subscriber_id: subscription.subscriber_id,
                        subscription_id: subscription.id,

                        getTrace: () => console.error(trace),
                        notification,
                        payload
                    }
                }
            );

            try {
                decoratedHandler(payload);
            } catch (error) {
                console.error(error);

                const trace = new Error('trace');
                this.updateHistory(
                    subscription.subscriber_id,
                    {
                        index: this.history.length,
                        kind: 'error from subscriber',
                        message: `Subscriber "${subscription.subscriber_id}" failed to process "${notification}" notification published by "${subscription.publisher_id}".`,
                        payload: {
                            publisher_id: subscription.subscriber_id,
                            subscriber_id: subscription.subscriber_id,
                            subscription_id: subscription.id,
                            getTrace: () => console.error(trace),
                            notification,
                            error,
                            payload
                        }
                    }
                );

                throw error;
            }
        }
    }

    private updateHistory(id: string, historyEntry: HistoryEntry): void {
        historyEntry.at = new Date();
        this.history.push(historyEntry);
        this.updateDedicatedHistoryEntry(id, historyEntry);
    }

    public recordSubscribers(subscriber: TimelineSubscriber) {
        this.subscribers.set(subscriber.getId(), subscriber);

        const trace = new Error('trace');
        this.updateHistory(subscriber.getId(),
            {
                index: this.history.length,
                kind: 'subscriber recorded',
                message: `Subscriber "${subscriber.getId()}" added to manager.`,
                payload: {
                    subscriber_id: subscriber.getId(),
                    getTrace: () => console.error(trace),
                }
            }
        );

        this.proxy.subscribe(
            subscriber.getProxy(),
            'subscribe',
            payload => this.onSubscribe(payload)
        );

        this.proxy.subscribe(
            subscriber.getProxy(),
            'destroy',
            () => this.removeSubscriber(subscriber.getId())
        );
    }

    public getHistory(): HistoryEntry[] {
        return [ ...this.history ]
    }

    public getHistoryFor(id: string): HistoryEntry[] {
        return this.dedicatedHistory.has(id)
            ? [... this.dedicatedHistory.get(id) as HistoryEntry[]]
            : []
    }
}

const manager = new PubSubManager();
if (typeof window !== 'undefined') {
    // @ts-ignore
    window[GLOBAL_MANAGER_ID] = manager
} else {
    // @ts-ignore
    global[GLOBAL_MANAGER_ID] = manager;
}

export class TimelinePublisher extends Publisher {
    constructor(id: string) {
        super(id);
        manager.recordPublisher(this);
    }

    public publish(notification: string, data?: any) {
        const trace = new Error('trace');
        super.publish('publish', {
            publisher: this,
            getTrace: () => console.error(trace),
            notification,
            payload: data
        });

        super.publish(notification, data);
    }

    public destroy() {
        this.publish('destroy');
        super.destroy();
    }
}

export class TimelineSubscriber extends Subscriber {
    private proxy: PublisherInterface;

    constructor(id: string) {
        super(id);

        this.proxy = new Publisher(`${id}-publisher-proxy`);
        manager.recordSubscribers(this);
    }

    public getProxy(): PublisherInterface {
        return this.proxy;
    }

    public recordSubscription(subscriptionId: string, notification: string) {
        super.recordSubscription(subscriptionId, notification);
        console.log('record subscription')
        this.proxy.publish('subscribe', {
            subscription: this.findSubscriptionById(subscriptionId),
            notification
        });
    }

    public destroy() {
        this.proxy.publish('destroy');
        this.proxy.destroy();
        super.destroy();
    }
}

