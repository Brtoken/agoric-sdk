/* global makeKind */

// @ts-check

import { Far } from '@agoric/marshal';
import { makeFarName, ERTPKind } from './interfaces';

export const makePaymentMaker = (allegedName, brand) => {
  const paymentVOMaker = state => {
    return {
      init: b => (state.brand = b),
      self: Far(makeFarName(allegedName, ERTPKind.PAYMENT), {
        getAllegedBrand: () => state.brand,
      }),
    };
  };
  
  const paymentMaker = makeKind(paymentVOMaker);

  const makePayment = () => paymentMaker(brand);

  return makePayment;
}

