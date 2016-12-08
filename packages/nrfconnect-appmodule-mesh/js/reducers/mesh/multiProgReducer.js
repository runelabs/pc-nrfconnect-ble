/* Copyright (c) 2016 Nordic Semiconductor. All Rights Reserved.
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

import {List, Record, Map} from 'immutable';

import * as MultiProgActions from '../../actions/mesh/nRF5MultiProgActions';

const ImmutableRoot = Record({
  isRunning: false,
  showCustomFile: false,
  snrSelected: List(),
})

const getImmutableRoot = () => new ImmutableRoot();

export default function multiProg(state = getImmutableRoot(), action) {
  switch (action.type) {
    case MultiProgActions.START_MULTI_PROG:
      return state.set('isRunning', true);
    case MultiProgActions.STOP_MULTI_PROG:
      return state.set('isRunning', false);
    case MultiProgActions.SHOW_CUSTOM_FILE:
      return state.set('showCustomFile', true);
    case MultiProgActions.HIDE_CUSTOM_FILE:
      return state.set('showCustomFile', false);
    case MultiProgActions.SELECTED_SNRS:
      return state.set('snrSelected', action.snrs);
    
      
  }
  return state;
}
