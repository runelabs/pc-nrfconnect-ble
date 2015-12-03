/* Copyright (c) 2015 Nordic Semiconductor. All Rights Reserved.
 *
 * The information contained herein is property of Nordic Semiconductor ASA.
 * Terms and conditions of usage are described in detail in NORDIC
 * SEMICONDUCTOR STANDARD SOFTWARE LICENSE AGREEMENT.
 *
 * Licensees are granted free, non-transferable use of the information. NO
 * WARRANTY of ANY KIND is provided. This heading must NOT be removed from
 * the file.
 *
 */

'use strict';

export const ADAPTER_OPEN = 'ADAPTER_OPEN';
export const ADAPTER_OPENED = 'ADAPTER_OPENED';
export const ADAPTER_CLOSED = 'ADAPTER_CLOSED';
export const ADAPTER_ADDED = 'ADAPTER_ADDED';
export const ADAPTER_REMOVED = 'ADAPTER_REMOVED';
export const ADAPTER_ERROR = 'ADAPTER_ERROR';
export const ADAPTER_STATE_CHANGED = 'ADAPTER_STATE_CHANGED';

export const DEVICE_CONNECT = 'DEVICE_CONNECT';
export const DEVICE_CONNECTED = 'DEVICE_CONNECTED';
export const DEVICE_CONNECT_TIMEOUT = 'DEVICE_CONNECT_TIMEOUT';
export const DEVICE_DISCONNECT = 'DEVICE_DISCONNECT';
export const DEVICE_DISCONNECTED = 'DEVICE_DISCONNECTED';
export const DEVICE_CANCEL_CONNECT = 'DEVICE_CANCEL_CONNECT';
export const DEVICE_CANCELLED_CONNECT = 'DEVICE_CANCELLED_CONNECT';
export const DEVICE_INITIATE_PAIRING = 'DEVICE_INITIATE_PAIRING';

export const DEVICE_CONNECTION_PARAM_UPDATE_REQUEST = 'DEVICE_CONNECTION_PARAM_UPDATE_REQUEST';
export const DEVICE_CONNECTION_PARAM_UPDATE_STATUS = 'DEVICE_CONNECTION_PARAM_UPDATE_STATUS';

export const ERROR_OCCURED = 'ERROR_OCCURED';

export const ATTRIBUTE_VALUE_CHANGED = 'ADAPTER_ATTRIBUTE_VALUE_CHANGED';

import _ from 'underscore';

import { driver, api } from 'pc-ble-driver-js';

import { discoverServices } from './deviceDetailsActions';
import { BLEEventState } from './common';

const _adapterFactory = api.AdapterFactory.getInstance(driver);

// Internal functions

// This function shall only be used by Promise.reject calls.
function makeError(data) {
    let {adapter, device, error} = data;

    return {
        adapter: adapter,
        device: device,
        error: error,
    };
}

function _getAdapters(dispatch) {
    return new Promise((resolve, reject) => {
        // Register listeners for adapters added/removed
        _adapterFactory.on('added', adapter => {
            dispatch(adapterAddedAction(adapter));
        });
        _adapterFactory.on('removed', adapter => {
            dispatch(adapterRemovedAction(adapter));
        });
        _adapterFactory.on('error', error => {
            dispatch(errorOccuredAction(undefined, error));
        });

        _adapterFactory.getAdapters((error, adapters) => {
            if (error) {
                reject(makeError({error:error}));
            } else {
                resolve();
            }
        });
    }).catch(error => {
        dispatch(errorOccuredAction(undefined, error));
    });
}

function _openAdapter(dispatch, getState, adapter) {
    return new Promise((resolve, reject) => {
        const options = {
            baudRate: 115200,
            parity: 'none',
            flowControl: 'none',
            eventInterval: 10,
            logLevel: 'info',
        };

        // Check if we already have an adapter open
        if (getState().adapter.api.selectedAdapter !== null) {
            _closeAdapter(dispatch, getState().adapter.api.selectedAdapter);
        }

        // TODO: try to remove the underscore library
        const adapterToUse = _.find(getState().adapter.api.adapters, x => { return x.state.port === adapter; });

        if (adapterToUse === null) {
            reject(makeError({error: `Not able to find ${adapter}.`}));
            return;
        }
        // Listen to errors from this adapter since we are opening it now
        adapterToUse.on('error', error => {
            // TODO: separate between what is an noen recoverable adapter error
            // TODO: and a recoverable error.
            // TODO: adapterErrorAction should only be used if it is an unrecoverable errors.
            // TODO: errorOccuredAction should be used for recoverable errors.
            dispatch(errorOccuredAction(adapterToUse, error));
        });

        // TODO: remove listeners when closing adapter so that we do not leak memory

        // Listen to adapter changes
        adapterToUse.on('stateChanged', state => {
            dispatch(adapterStateChangedAction(adapterToUse, state));
        });

        adapterToUse.on('deviceConnected', device => {
            dispatch(deviceConnectedAction(device));
            dispatch(discoverServices(device));
        });

        adapterToUse.on('deviceDisconnected', device => {
            dispatch(deviceDisconnectedAction(device));
        });

        adapterToUse.on('connectTimedOut', deviceAddress => {
            dispatch(deviceConnectTimeoutAction(deviceAddress));
        });

        adapterToUse.on('connParamUpdateRequest', (device, requestedConnectionParams) => {
            dispatch(deviceConnParamUpdateRequestAction(device, requestedConnectionParams));
        });

        adapterToUse.on('characteristicValueChanged', (characteristic) => {
            dispatch(attributeValueChanged(characteristic));
        });

        adapterToUse.on('descriptorValueChanged', (descriptor) => {
            dispatch(attributeValueChanged(descriptor));
        });

        dispatch(adapterOpenAction(adapterToUse));

        adapterToUse.open(options, error => {
            if (error) {
                reject(makeError({adapter: adapterToUse, error: error}));
            } else {
                adapterToUse.getState((error, state) => {
                    if (error) {
                        reject(makeError({ adapter: adapterToUse, error: error }));
                    } else {
                        resolve(adapterToUse);
                    }
                });
            }
        });
    }).then(adapter => {
        dispatch(adapterOpenedAction(adapter));
    }).catch(errorData => {
        // Check if the error is message is of our 'standard' type made by makeError
        if (errorData.error === undefined && errorData.adapter === undefined) {
            dispatch(errorOccuredAction(undefined, errorData));
        } else {
            dispatch(adapterErrorAction(errorData.adapter, errorData.error));
        }
    });
}

function _closeAdapter(dispatch, adapter) {
    return new Promise((resolve, reject) => {
        adapter.close(error => {
            if (error) {
                reject(makeError({ adapter: adapter, error: error}));
            } else {
                resolve(adapter);
            }
        });
    }).then(adapter => {
        dispatch(adapterClosedAction(adapter));
    }).catch(errorData => {
        dispatch(adapterErrorAction(errorData.adapter, errorData.error));
    });
}

function _updateDeviceConnectionParams(dispatch, getState, id, device, connectionParams) {
    return new Promise((resolve, reject) => {
        const adapterToUse = getState().adapter.api.selectedAdapter;

        adapterToUse.updateConnectionParameters(device.instanceId, connectionParams, (error, device) => {
            if (error) {
                reject(makeError({ adapter: adapterToUse, error: error }));
            } else {
                resolve(device);
            }
        });
    }).then(device => {
        dispatch(connectionParamUpdateStatusAction(id, device, BLEEventState.SUCCESS));
    }).catch(errorData => {
        dispatch(connectionParamUpdateStatusAction(id, device, BLEEventState.ERROR));
        dispatch(errorOccuredAction(errorData.adapter, errorData.error));
    });
}

function _rejectConnectionParams(dispatch, getState, id, device) {
    return new Promise((resolve, reject) => {
        const adapterToUse = getState().adapter.api.selectedAdapter;

        if (adapterToUse === null) {
            reject(makeError({ error: 'No adapter selected!' }));
            return;
        }

        adapterToUse.rejectConnParams(device.instanceId, error => {
            if (error) {
                reject(makeError({ adapter: adapterToUse, error: error }));
            } else {
                resolve();
            }
        });
    }).then(() => {
        dispatch(connectionParamUpdateStatusAction(id, device, BLEEventState.REJECTED));
        // Do we need to tell anyone this went OK ?
    }).catch(errorData => {
        dispatch(connectionParamUpdateStatusAction(id, device, BLEEventState.ERROR));
        dispatch(errorOccuredAction(errorData.adapter, errorData.error));
    });
}

function adapterOpenedAction(adapter)
{
    return {
        type: ADAPTER_OPENED,
        adapter,
    };
}

function adapterOpenAction(adapter)
{
    return {
        type: ADAPTER_OPEN,
        adapter,
    };
}

function adapterClosedAction(adapter) {
    return {
        type: ADAPTER_CLOSED,
        adapter,
    };
}

function adapterRemovedAction(adapter) {
    return {
        type: ADAPTER_REMOVED,
        adapter,
    };
}

function adapterAddedAction(adapter) {
    return {
        type: ADAPTER_ADDED,
        adapter,
    };
}

function adapterErrorAction(adapter, error) {
    return {
        type: ADAPTER_ERROR,
        adapter,
        error,
    };
}

function adapterStateChangedAction(adapter, state) {
    return {
        type: ADAPTER_STATE_CHANGED,
        adapter,
        state,
    };
}

function connectionParamUpdateStatusAction(id, device, status) {
    return {
        type: DEVICE_CONNECTION_PARAM_UPDATE_STATUS,
        id: id,
        device: device,
        status: status,
    };
}

function _pairWithDevice(dispatch, getState, device) {
    function onSecurityChanged(resolve, event) {
        resolve(event);
    }

    function onError(reject, error) {
        reject(makeError({adapter: null, error, device: null}));
    }

    const adapterToUse = getState().adapter.api.selectedAdapter;

    return new Promise((resolve, reject) => {

        if (adapterToUse === null) {
            reject(makeError({error: 'No adapter selected'}));
        }

        adapterToUse.once('securityChanged', event => onSecurityChanged(resolve, event));
        adapterToUse.once('error', error => onError(reject, error));

        adapterToUse.pair(device.instanceId, false, error => {
            if (error) {
                reject(makeError({adapter: adapterToUse, error, device}));
            }
        });
    }).catch(errorData => {
        dispatch(errorOccuredAction(errorData.adapter, errorData.error));
    }).then(() => {
        adapterToUse.removeListener(onSecurityChanged);
    });
}

function _connectToDevice(dispatch, getState, device) {
    function onCompleted(resolve, adapter) {
        resolve(adapter);
    }

    return new Promise((resolve, reject) => {
        const adapterToUse = getState().adapter.api.selectedAdapter;

        if (adapterToUse === null) {
            reject(makeError({adapter: null, error: `No adapter selected`}));
        }

        const connectionParameters = {
            min_conn_interval: 7.5,
            max_conn_interval: 7.5,
            slave_latency: 0,
            conn_sup_timeout: 4000,
        };

        const scanParameters = {
            active: true,
            interval: 100,
            window: 50,
            timeout: 20,
        };

        const options = {
            scanParams: scanParameters,
            connParams: connectionParameters,
        };

        dispatch(deviceConnectAction(device));

        // We add these two so that we are able to resolve this promise if
        // the device connects or the connection attempt times out. If we do
        // not resolve the promise we may get a memory leak.
        adapterToUse.once('deviceConnected', onCompleted.bind(this, resolve, adapterToUse));
        adapterToUse.once('connectTimedOut', onCompleted.bind(this, resolve, adapterToUse));

        adapterToUse.connect(
            { address: device.address, type: 'BLE_GAP_ADDR_TYPE_RANDOM_STATIC' },
            options,
            error => {
                if (error) {
                    reject(makeError({ adapter: adapterToUse, device: device, error: { message: error } }));
                }
            }
        );
    }).catch(errorData => {
        dispatch(errorOccuredAction(errorData.adapter, errorData.error));
    }).then(adapterToUse => {
        adapterToUse.removeListener(onCompleted);
    });
}

function _disconnectFromDevice(dispatch, getState, device) {
    return new Promise((resolve, reject) => {
        const adapterToUse = getState().adapter.api.selectedAdapter;

        if (adapterToUse === null) {
            reject(makeError({error: 'No adapter selected'}));
            return;
        }

        adapterToUse.disconnect(device.instanceId, (error, device) => {
            if (error) {
                reject(makeError({adapter: adapterToUse, error, device}));
            } else {
                resolve(device);
            }
        });
    }).then(device => {
        // OK, nothing to do... ?
        dispatch(deviceDisconnectedAction(device));
    }).catch(error => {
        dispatch(errorOccuredAction(error.adapter, error.error));
    });
}

function _cancelConnect(dispatch, getState) {
    return new Promise((resolve, reject) => {
        const adapterToUse = getState().adapter.api.selectedAdapter;

        if (adapterToUse === null) {
            reject(makeError({error: `No adapter selected`}));
        }

        dispatch(deviceCancelConnectAction());

        adapterToUse.cancelConnect(
            error => {
                if (error) {
                    reject(makeError({adapter: adapterToUse, error: error}));
                }

                resolve();
            });
    }).then(device => {
        dispatch(deviceCancelledConnectAction());
    }).catch(error => {
        dispatch(errorOccuredAction(error.adapter, error.error));
    });
}

function deviceConnectAction(device) {
    return {
        type: DEVICE_CONNECT,
        device,
    };
}

function deviceConnectedAction(device) {
    return {
        type: DEVICE_CONNECTED,
        device,
    };
}

function deviceConnectTimeoutAction(deviceAddress) {
    return {
        type: DEVICE_CONNECT_TIMEOUT,
        deviceAddress,
    };
}

function deviceDisconnectedAction(device) {
    return {
        type: DEVICE_DISCONNECTED,
        device,
    };
}

function deviceCancelledConnectAction() {
    return {
        type: DEVICE_CANCELLED_CONNECT,
    };
}

function deviceCancelConnectAction() {
    return {
        type: DEVICE_CANCEL_CONNECT,
    };
}

function deviceConnParamUpdateRequestAction(device, requestedConnectionParams) {
    return {
        type: DEVICE_CONNECTION_PARAM_UPDATE_REQUEST,
        device,
        requestedConnectionParams,
    };
}

function errorOccuredAction(adapter, error) {
    return {
        type: ERROR_OCCURED,
        adapter,
        error,
    };
}

function pairWithDeviceAction(device) {
    return {
        type: DEVICE_INITIATE_PAIRING,
        device,
    };
}

function attributeValueChanged(attribute, value) {
    return {
        type: ATTRIBUTE_VALUE_CHANGED,
        attribute,
        value,
    };
}

export function findAdapters() {
    return dispatch => {
        return _getAdapters(dispatch);
    };
}

export function openAdapter(adapter) {
    return (dispatch, getState) => {
        return _openAdapter(dispatch, getState, adapter);
    };
}

export function closeAdapter(adapter) {
    return dispatch => {
        return _closeAdapter(dispatch, adapter);
    };
}

export function connectToDevice(device) {
    return (dispatch, getState) => {
        return _connectToDevice(dispatch, getState, device);
    };
}

export function disconnectFromDevice(device) {
    return (dispatch, getState) => {
        return _disconnectFromDevice(dispatch, getState, device);
    };
}

export function pairWithDevice(device) {
    return (dispatch, getState) => {
        return _pairWithDevice(dispatch, getState, device);
    };
}

export function cancelConnect() {
    return (dispatch, getState) => {
        return _cancelConnect(dispatch, getState);
    };
}

export function updateDeviceConnectionParams(id, device, connectionParams) {
    return (dispatch, getState) => {
        return _updateDeviceConnectionParams(dispatch, getState, id, device, connectionParams);
    };
}

export function rejectDeviceConnectionParams(id, device) {
    return (dispatch, getState) => {
        return _rejectConnectionParams(dispatch, getState, id, device);
    };
}
