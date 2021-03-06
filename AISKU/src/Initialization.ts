// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { CoreUtils, IConfiguration, AppInsightsCore, IAppInsightsCore, LoggingSeverity, _InternalMessageId, ITelemetryItem, ICustomProperties, IChannelControls, hasWindow, hasDocument, isReactNative } from "@microsoft/applicationinsights-core-js";
import { ApplicationInsights } from "@microsoft/applicationinsights-analytics-js";
import { Sender } from "@microsoft/applicationinsights-channel-js";
import { PropertiesPlugin, TelemetryContext } from "@microsoft/applicationinsights-properties-js";
import { AjaxPlugin as DependenciesPlugin, IDependenciesPlugin } from '@microsoft/applicationinsights-dependencies-js';
import * as Common from "@microsoft/applicationinsights-common"

"use strict";

let _internalSdkSrc: string;

/**
 *
 * @export
 * @interface Snippet
 */
export interface Snippet {
    config: IConfiguration & Common.IConfig;
    queue?: Array<() => void>;
    sv?: string;
    version?: number;
}

export interface IApplicationInsights extends Common.IAppInsights, IDependenciesPlugin, Common.IPropertiesPlugin {
    appInsights: ApplicationInsights;
    flush: (async?: boolean) => void;
    onunloadFlush: (async?: boolean) => void;
};

/**
 * Telemetry type classes, e.g. PageView, Exception, etc
 */
export const Telemetry = Common;

/**
 * Application Insights API
 * @class Initialization
 * @implements {IApplicationInsights}
 */
export class Initialization implements IApplicationInsights {
    public snippet: Snippet;
    public config: IConfiguration & Common.IConfig;
    public appInsights: ApplicationInsights;
    public core: IAppInsightsCore;
    public context: TelemetryContext;

    private dependencies: DependenciesPlugin;
    private properties: PropertiesPlugin;
    private _snippetVersion: string;

    constructor(snippet: Snippet) {
        let _this = this;
        // initialize the queue and config in case they are undefined
        _this._snippetVersion = "" + (snippet.sv || snippet.version || "");
        snippet.queue = snippet.queue || [];
        snippet.version = snippet.version || 2.0; // Default to new version
        let config: IConfiguration & Common.IConfig = snippet.config || ({} as any);

        if (config.connectionString) {
            const cs = Common.ConnectionStringParser.parse(config.connectionString);
            const ingest = cs.ingestionendpoint;
            config.endpointUrl = ingest ? `${ingest}/v2/track` : config.endpointUrl; // only add /v2/track when from connectionstring
            config.instrumentationKey = cs.instrumentationkey || config.instrumentationKey;
        }

        _this.appInsights = new ApplicationInsights();

        _this.properties = new PropertiesPlugin();
        _this.dependencies = new DependenciesPlugin();
        _this.core = new AppInsightsCore();

        _this.snippet = snippet;
        _this.config = config;
        _this.getSKUDefaults();
    }

    // Analytics Plugin
    /**
     * Log a user action or other occurrence.
     * @param {IEventTelemetry} event
     * @param {ICustomProperties} [customProperties]
     * @memberof Initialization
     */
    public trackEvent(event: Common.IEventTelemetry, customProperties?: ICustomProperties) {
        this.appInsights.trackEvent(event, customProperties);
    }

    /**
     * Logs that a page, or similar container was displayed to the user.
     * @param {IPageViewTelemetry} pageView
     * @memberof Initialization
     */
    public trackPageView(pageView?: Common.IPageViewTelemetry) {
        const inPv = pageView || {};
        this.appInsights.trackPageView(inPv);
    }

    /**
     * Log a bag of performance information via the customProperties field.
     * @param {IPageViewPerformanceTelemetry} pageViewPerformance
     * @memberof Initialization
     */
    public trackPageViewPerformance(pageViewPerformance: Common.IPageViewPerformanceTelemetry): void {
        const inPvp = pageViewPerformance || {};
        this.appInsights.trackPageViewPerformance(inPvp);
    }

    /**
     * Log an exception that you have caught.
     * @param {IExceptionTelemetry} exception
     * @memberof Initialization
     */
    public trackException(exception: Common.IExceptionTelemetry): void {
        if (!exception.exception && (exception as any).error) {
            exception.exception = (exception as any).error;
        }
        this.appInsights.trackException(exception);
    }

    /**
     * Manually send uncaught exception telemetry. This method is automatically triggered
     * on a window.onerror event.
     * @param {IAutoExceptionTelemetry} exception
     * @memberof Initialization
     */
    public _onerror(exception: Common.IAutoExceptionTelemetry): void {
        this.appInsights._onerror(exception);
    }

    /**
     * Log a diagnostic scenario such entering or leaving a function.
     * @param {ITraceTelemetry} trace
     * @param {ICustomProperties} [customProperties]
     * @memberof Initialization
     */
    public trackTrace(trace: Common.ITraceTelemetry, customProperties?: ICustomProperties): void {
        this.appInsights.trackTrace(trace, customProperties);
    }

    /**
     * Log a numeric value that is not associated with a specific event. Typically used
     * to send regular reports of performance indicators.
     *
     * To send a single measurement, just use the `name` and `average` fields
     * of {@link IMetricTelemetry}.
     *
     * If you take measurements frequently, you can reduce the telemetry bandwidth by
     * aggregating multiple measurements and sending the resulting average and modifying
     * the `sampleCount` field of {@link IMetricTelemetry}.
     * @param {IMetricTelemetry} metric input object argument. Only `name` and `average` are mandatory.
     * @param {ICustomProperties} [customProperties]
     * @memberof Initialization
     */
    public trackMetric(metric: Common.IMetricTelemetry, customProperties?: ICustomProperties): void {
        this.appInsights.trackMetric(metric, customProperties);
    }
    /**
     * Starts the timer for tracking a page load time. Use this instead of `trackPageView` if you want to control when the page view timer starts and stops,
     * but don't want to calculate the duration yourself. This method doesn't send any telemetry. Call `stopTrackPage` to log the end of the page view
     * and send the event.
     * @param name A string that idenfities this item, unique within this HTML document. Defaults to the document title.
     */
    public startTrackPage(name?: string): void {
        this.appInsights.startTrackPage(name);
    }

    /**
     * Stops the timer that was started by calling `startTrackPage` and sends the pageview load time telemetry with the specified properties and measurements.
     * The duration of the page view will be the time between calling `startTrackPage` and `stopTrackPage`.
     * @param   name  The string you used as the name in startTrackPage. Defaults to the document title.
     * @param   url   String - a relative or absolute URL that identifies the page or other item. Defaults to the window location.
     * @param   properties  map[string, string] - additional data used to filter pages and metrics in the portal. Defaults to empty.
     * @param   measurements    map[string, number] - metrics associated with this page, displayed in Metrics Explorer on the portal. Defaults to empty.
     */
    public stopTrackPage(name?: string, url?: string, customProperties?: { [key: string]: any; }, measurements?: { [key: string]: number; }) {
        this.appInsights.stopTrackPage(name, url, customProperties, measurements);
    }

    public startTrackEvent(name?: string): void {
        this.appInsights.startTrackEvent(name);
    }

    /**
     * Log an extended event that you started timing with `startTrackEvent`.
     * @param   name    The string you used to identify this event in `startTrackEvent`.
     * @param   properties  map[string, string] - additional data used to filter events and metrics in the portal. Defaults to empty.
     * @param   measurements    map[string, number] - metrics associated with this event, displayed in Metrics Explorer on the portal. Defaults to empty.
     */
    public stopTrackEvent(name: string, properties?: { [key: string]: string; }, measurements?: { [key: string]: number; }) {
        this.appInsights.stopTrackEvent(name, properties, measurements); // Todo: Fix to pass measurements once type is updated
    }

    public addTelemetryInitializer(telemetryInitializer: (item: ITelemetryItem) => boolean | void) {
        return this.appInsights.addTelemetryInitializer(telemetryInitializer);
    }

    // Properties Plugin

    /**
     * Set the authenticated user id and the account id. Used for identifying a specific signed-in user. Parameters must not contain whitespace or ,;=|
     *
     * The method will only set the `authenticatedUserId` and `accountId` in the current page view. To set them for the whole session, you should set `storeInCookie = true`
     * @param {string} authenticatedUserId
     * @param {string} [accountId]
     * @param {boolean} [storeInCookie=false]
     * @memberof Initialization
     */
    public setAuthenticatedUserContext(authenticatedUserId: string, accountId?: string, storeInCookie = false): void {
        this.properties.context.user.setAuthenticatedUserContext(authenticatedUserId, accountId, storeInCookie);
    }

    /**
     * Clears the authenticated user id and account id. The associated cookie is cleared, if present.
     * @memberof Initialization
     */
    public clearAuthenticatedUserContext(): void {
        this.properties.context.user.clearAuthenticatedUserContext();
    }

    // Dependencies Plugin

    /**
     * Log a dependency call (e.g. ajax)
     * @param {IDependencyTelemetry} dependency
     * @memberof Initialization
     */
    public trackDependencyData(dependency: Common.IDependencyTelemetry): void {
        this.dependencies.trackDependencyData(dependency);
    }

    // Misc

    /**
     * Manually trigger an immediate send of all telemetry still in the buffer.
     * @param {boolean} [async=true]
     * @memberof Initialization
     */
    public flush(async: boolean = true) {
        CoreUtils.arrForEach(this.core.getTransmissionControls(), channels => {
            CoreUtils.arrForEach(channels, channel => {
                channel.flush(async);
            })
        })
    }

    /**
     * Manually trigger an immediate send of all telemetry still in the buffer using beacon Sender.
     * Fall back to xhr sender if beacon is not supported.
     * @param {boolean} [async=true]
     * @memberof Initialization
     */
    public onunloadFlush(async: boolean = true) {
        CoreUtils.arrForEach(this.core.getTransmissionControls(), channels => {
            CoreUtils.arrForEach(channels, (channel: IChannelControls & Sender) => {
                if (channel.onunloadFlush) {
                    channel.onunloadFlush();
                } else {
                    channel.flush(async);
                }
            })
        })
    }

    /**
     * Initialize this instance of ApplicationInsights
     * @returns {IApplicationInsights}
     * @memberof Initialization
     */
    public loadAppInsights(legacyMode: boolean = false): IApplicationInsights {
        let _this = this;

        function _updateSnippetProperties(snippet: Snippet) {
            if (snippet) {
                let snippetVer = "";
                if (!CoreUtils.isNullOrUndefined(_this._snippetVersion)) {
                    snippetVer += _this._snippetVersion;
                }
                if (legacyMode) {
                    snippetVer += ".lg";
                }

                if (_this.context) {
                    _this.context.internal.snippetVer = snippetVer || "-";
                }

                // apply updated properties to the global instance (snippet)
                for (const field in _this) {
                    if (CoreUtils.isString(field) && 
                            !CoreUtils.isFunction(_this[field]) && 
                            field.substring(0, 1) !== "_") {            // Don't copy "internal" values
                        snippet[field as string] = _this[field];
                    }
                }
            }
        }
        
        // dont allow additional channels/other extensions for legacy mode; legacy mode is only to allow users to switch with no code changes!
        if (legacyMode && _this.config.extensions && _this.config.extensions.length > 0) {
            throw new Error("Extensions not allowed in legacy mode");
        }

        const extensions = [];
        const appInsightsChannel: Sender = new Sender();

        extensions.push(appInsightsChannel);
        extensions.push(_this.properties);
        extensions.push(_this.dependencies);
        extensions.push(_this.appInsights);

        // initialize core
        _this.core.initialize(_this.config, extensions);
        _this.context = _this.properties.context;
        if (_internalSdkSrc && _this.context) {
            _this.context.internal.sdkSrc = _internalSdkSrc;
        }
        _updateSnippetProperties(_this.snippet);

        // Empty queue of all api calls logged prior to sdk download
        _this.emptyQueue();
        _this.pollInternalLogs();
        _this.addHousekeepingBeforeUnload(this);

        return _this;
    }

    /**
     * Overwrite the lazy loaded fields of global window snippet to contain the
     * actual initialized API methods
     * @param {Snippet} snippet
     * @memberof Initialization
     */
    public updateSnippetDefinitions(snippet: Snippet) {
        // apply full appInsights to the global instance
        // Note: This must be called before loadAppInsights is called
        for (const field in this) {
            if (CoreUtils.isString(field)) {
                snippet[field as string] = this[field];
            }
        }
    }

    /**
     * Call any functions that were queued before the main script was loaded
     * @memberof Initialization
     */
    public emptyQueue() {
        let _this = this;

        // call functions that were queued before the main script was loaded
        try {
            if (Common.Util.isArray(_this.snippet.queue)) {
                // note: do not check length in the for-loop conditional in case something goes wrong and the stub methods are not overridden.
                const length = _this.snippet.queue.length;
                for (let i = 0; i < length; i++) {
                    const call = _this.snippet.queue[i];
                    call();
                }

                _this.snippet.queue = undefined;
                delete _this.snippet.queue;
            }
        } catch (exception) {
            const properties: any = {};
            if (exception && CoreUtils.isFunction(exception.toString)) {
                properties.exception = exception.toString();
            }

            // need from core
            // Microsoft.ApplicationInsights._InternalLogging.throwInternal(
            //     LoggingSeverity.WARNING,
            //     _InternalMessageId.FailedToSendQueuedTelemetry,
            //     "Failed to send queued telemetry",
            //     properties);
        }
    }

    public pollInternalLogs(): void {
        this.core.pollInternalLogs();
    }

    public addHousekeepingBeforeUnload(appInsightsInstance: IApplicationInsights): void {
        // Add callback to push events when the user navigates away

        if (hasWindow() || hasDocument()) {
            const performHousekeeping = () => {
                // Adds the ability to flush all data before the page unloads.
                // Note: This approach tries to push a sync request with all the pending events onbeforeunload.
                // Firefox does not respect this.Other browsers DO push out the call with < 100% hit rate.
                // Telemetry here will help us analyze how effective this approach is.
                // Another approach would be to make this call sync with a acceptable timeout to reduce the
                // impact on user experience.

                // appInsightsInstance.context._sender.triggerSend();
                appInsightsInstance.onunloadFlush(false);

                // Back up the current session to local storage
                // This lets us close expired sessions after the cookies themselves expire
                const ext = appInsightsInstance.appInsights.core['_extensions'][Common.PropertiesPluginIdentifier];
                if (ext && ext.context && ext.context._sessionManager) {
                    ext.context._sessionManager.backup();
                }
            };

            if (!appInsightsInstance.appInsights.config.disableFlushOnBeforeUnload) {
                // Hook the unload event for the document, window and body to ensure that the client events are flushed to the server
                // As just hooking the window does not always fire (on chrome) for page navigations.
                let added = CoreUtils.addEventHandler('beforeunload', performHousekeeping);
                added = CoreUtils.addEventHandler('pagehide', performHousekeeping) || added;

                // A reactNative app may not have a window and therefore the beforeunload/pagehide events -- so don't
                // log the failure in this case
                if (!added && !isReactNative()) {
                    appInsightsInstance.appInsights.core.logger.throwInternal(
                        LoggingSeverity.CRITICAL,
                        _InternalMessageId.FailedToAddHandlerForOnBeforeUnload,
                        'Could not add handler for beforeunload and pagehide');
                }
            }

            // We also need to hook the pagehide event as not all versions of Safari support load/unload events.
            if (!appInsightsInstance.appInsights.config.disableFlushOnUnload) {
                // Not adding any telemetry as pagehide as it's not supported on all browsers
                CoreUtils.addEventHandler('pagehide', performHousekeeping);
            }
        }
    }

    private getSKUDefaults() {
        let _this = this;
        _this.config.diagnosticLogInterval =
        _this.config.diagnosticLogInterval && _this.config.diagnosticLogInterval > 0 ? _this.config.diagnosticLogInterval : 10000;
    }
}

// tslint:disable-next-line
(function () {
    let sdkSrc = null;
    let isModule = false;
    let cdns: string[] = [
        "://az416426.vo.msecnd.net/"
    ];

    try {
        // Try and determine whether the sdk is being loaded from the CDN
        // currentScript is only valid during initial processing
        let scrpt = (document ||{} as any).currentScript;
        if (scrpt) {
            sdkSrc = scrpt.src;
        // } else {
        //     // We need to update to at least typescript 2.9 for this to work :-(
        //     // Leaving as a stub for now so after we upgrade this breadcrumb is available
        //     let meta = import.meta;
        //     sdkSrc = (meta || {}).url;
        //     isModule = true;
        }
    } catch (e) {
    }

    if (sdkSrc) {
        try {
            let url = sdkSrc.toLowerCase();
            if (url) {
                let src = "";
                for (let idx = 0; idx < cdns.length; idx++) {
                    if (url.indexof(cdns[idx]) !== -1) {
                        src = "cdn" + (idx + 1);
                        if (url.indexOf("/scripts/") === -1) {
                            if (url.indexOf("/next/") !== -1) {
                                src += "-next";
                            } else if (url.indexOf("/beta/") !== -1) {
                                src += "-beta";
                            }
                        }

                        _internalSdkSrc = src + (isModule ? ".mod" : "");
                        break;
                    }
                }
            }
        } catch (e) {
        }
    }
})();
