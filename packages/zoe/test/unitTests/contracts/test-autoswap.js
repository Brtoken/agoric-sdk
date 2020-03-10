// eslint-disable-next-line import/no-extraneous-dependencies
import { test } from 'tape-promise/tape';
// eslint-disable-next-line import/no-extraneous-dependencies
import bundleSource from '@agoric/bundle-source';

import harden from '@agoric/harden';

import { makeZoe } from '../../../src/zoe';
import { setup } from '../setupBasicMints2';

const autoswapRoot = `${__dirname}/../../../src/contracts/autoswap`;

test('autoSwap with valid offers', async t => {
  try {
    const { moolaR, simoleanR, moola, simoleans } = setup();
    const zoe = makeZoe({ require });
    const inviteIssuer = zoe.getInviteIssuer();

    // Setup Alice
    const aliceMoolaPayment = moolaR.mint.mintPayment(moola(10));
    // Let's assume that simoleans are worth 2x as much as moola
    const aliceSimoleanPayment = simoleanR.mint.mintPayment(simoleans(5));

    // Setup Bob
    const bobMoolaPayment = moolaR.mint.mintPayment(moola(3));
    const bobSimoleanPayment = simoleanR.mint.mintPayment(simoleans(3));

    // Alice creates an autoswap instance

    // Pack the contract.
    const { source, moduleFormat } = await bundleSource(autoswapRoot);

    const installationHandle = zoe.install(source, moduleFormat);
    const roles = harden({ TokenA: moolaR.issuer, TokenB: simoleanR.issuer });
    const aliceInvite = await zoe.makeInstance(installationHandle, roles);
    const { instanceHandle } = inviteIssuer.getAmountOf(aliceInvite).extent[0];
    const { publicAPI } = zoe.getInstance(instanceHandle);
    const liquidityIssuer = publicAPI.getLiquidityIssuer();
    const liquidity = liquidityIssuer.getAmountMath().make;

    // Alice adds liquidity
    // 10 moola = 5 simoleans at the time of the liquidity adding
    // aka 2 moola = 1 simolean
    const aliceOfferRules = harden({
      want: { Liquidity: liquidity(10) },
      offer: { TokenA: moola(10), TokenB: simoleans(5) },
    });
    const alicePayments = {
      TokenA: aliceMoolaPayment,
      TokenB: aliceSimoleanPayment,
    };

    const {
      seat: aliceSeat,
      payout: aliceAddLiquidityPayoutP,
    } = await zoe.redeem(aliceInvite, aliceOfferRules, alicePayments);

    const liquidityOk = await aliceSeat.addLiquidity();
    t.equals(liquidityOk, 'Added liquidity.');

    const liquidityPayments = await aliceAddLiquidityPayoutP;
    const liquidityPayout = await liquidityPayments.Liquidity;

    t.deepEquals(liquidityIssuer.getAmountOf(liquidityPayout), liquidity(10));
    t.deepEquals(publicAPI.getPoolAmounts(), {
      TokenA: moola(10),
      TokenB: simoleans(5),
      Liquidity: liquidity(0),
    });

    // Alice creates an invite for autoswap and sends it to Bob
    const bobInvite = publicAPI.makeInvite();

    // Bob claims it
    const bobExclInvite = await inviteIssuer.claim(bobInvite);
    const bobInviteExtent = inviteIssuer.getAmountOf(bobExclInvite).extent[0];
    const {
      publicAPI: bobAutoswap,
      installationHandle: bobInstallationId,
    } = zoe.getInstance(bobInviteExtent.instanceHandle);
    t.equals(bobInstallationId, installationHandle);

    // Bob looks up the price of 3 moola in simoleans
    const simoleanAmounts = bobAutoswap.getPrice(harden({ TokenA: moola(3) }));
    t.deepEquals(simoleanAmounts, simoleans(1));

    // Bob escrows

    const bobMoolaForSimOfferRules = harden({
      want: { TokenB: simoleans(1) },
      offer: { TokenA: moola(3) },
    });
    const bobMoolaForSimPayments = harden({ TokenA: bobMoolaPayment });

    const { seat: bobSeat, payout: bobPayoutP } = await zoe.redeem(
      bobExclInvite,
      bobMoolaForSimOfferRules,
      bobMoolaForSimPayments,
    );

    // Bob swaps
    const offerOk = bobSeat.swap();
    t.equal(offerOk, 'Swap successfully completed.');

    const bobPayout = await bobPayoutP;

    const bobMoolaPayout1 = await bobPayout.TokenA;
    const bobSimoleanPayout1 = await bobPayout.TokenB;

    t.deepEqual(moolaR.issuer.getAmountOf(bobMoolaPayout1), moola(0));
    t.deepEqual(simoleanR.issuer.getAmountOf(bobSimoleanPayout1), simoleans(1));
    t.deepEquals(bobAutoswap.getPoolAmounts(), {
      TokenA: moola(13),
      TokenB: simoleans(4),
      Liquidity: liquidity(0),
    });

    // Bob looks up the price of 3 simoleans
    const moolaAmounts = bobAutoswap.getPrice(harden({ TokenB: simoleans(3) }));
    t.deepEquals(moolaAmounts, moola(5));

    // Bob makes another offer and swaps
    const bobSecondInvite = bobAutoswap.makeInvite();
    const bobSimsForMoolaOfferRules = harden({
      want: { TokenA: moola(5) },
      offer: { TokenB: simoleans(3) },
    });
    const simsForMoolaPayments = harden({ TokenB: bobSimoleanPayment });

    const {
      seat: bobSeatSimsForMoola,
      payout: bobSimsForMoolaPayoutP,
    } = await zoe.redeem(
      bobSecondInvite,
      bobSimsForMoolaOfferRules,
      simsForMoolaPayments,
    );

    const simsForMoolaOk = bobSeatSimsForMoola.swap();
    t.equal(simsForMoolaOk, 'Swap successfully completed.');

    const bobSimsForMoolaPayout = await bobSimsForMoolaPayoutP;
    const bobMoolaPayout2 = await bobSimsForMoolaPayout.TokenA;
    const bobSimoleanPayout2 = await bobSimsForMoolaPayout.TokenB;

    t.deepEqual(moolaR.issuer.getAmountOf(bobMoolaPayout2), moola(5));
    t.deepEqual(simoleanR.issuer.getAmountOf(bobSimoleanPayout2), simoleans(0));
    t.deepEqual(bobAutoswap.getPoolAmounts(), {
      TokenA: moola(8),
      TokenB: simoleans(7),
      Liquidity: liquidity(0),
    });

    // Alice removes her liquidity
    // She's not picky...
    const aliceSecondInvite = publicAPI.makeInvite();
    const aliceRemoveLiquidityOfferRules = harden({
      offer: { Liquidity: liquidity(10) },
    });

    const {
      seat: aliceRemoveLiquiditySeat,
      payout: aliceRemoveLiquidityPayoutP,
    } = await zoe.redeem(
      aliceSecondInvite,
      aliceRemoveLiquidityOfferRules,
      harden({ Liquidity: liquidityPayout }),
    );

    const removeLiquidityResult = aliceRemoveLiquiditySeat.removeLiquidity();
    t.equals(removeLiquidityResult, 'Liquidity successfully removed.');

    const aliceRemoveLiquidityPayout = await aliceRemoveLiquidityPayoutP;
    const aliceMoolaPayout = await aliceRemoveLiquidityPayout.TokenA;
    const aliceSimoleanPayout = await aliceRemoveLiquidityPayout.TokenB;
    const aliceLiquidityPayout = await aliceRemoveLiquidityPayout.Liquidity;

    t.deepEquals(moolaR.issuer.getAmountOf(aliceMoolaPayout), moola(8));
    t.deepEquals(
      simoleanR.issuer.getAmountOf(aliceSimoleanPayout),
      simoleans(7),
    );
    t.deepEquals(
      liquidityIssuer.getAmountOf(aliceLiquidityPayout),
      liquidity(0),
    );
    t.deepEquals(publicAPI.getPoolAmounts(), {
      TokenA: moola(0),
      TokenB: simoleans(0),
      Liquidity: liquidity(10),
    });
  } catch (e) {
    t.assert(false, e);
    console.log(e);
  } finally {
    t.end();
  }
});

test('autoSwap - test fee', async t => {
  try {
    const { moolaR, simoleanR, moola, simoleans } = setup();
    const zoe = makeZoe({ require });
    const inviteIssuer = zoe.getInviteIssuer();

    // Setup Alice
    const aliceMoolaPayment = moolaR.mint.mintPayment(moola(10000));
    const aliceSimoleanPayment = simoleanR.mint.mintPayment(simoleans(10000));

    // Setup Bob
    const bobMoolaPayment = moolaR.mint.mintPayment(moola(1000));

    // Alice creates an autoswap instance

    // Pack the contract.
    const { source, moduleFormat } = await bundleSource(autoswapRoot);

    const installationHandle = zoe.install(source, moduleFormat);
    const roles = harden({ TokenA: moolaR.issuer, TokenB: simoleanR.issuer });
    const aliceInvite = await zoe.makeInstance(installationHandle, roles);
    const { instanceHandle } = inviteIssuer.getAmountOf(aliceInvite).extent[0];
    const { publicAPI } = zoe.getInstance(instanceHandle);
    const liquidityIssuer = publicAPI.getLiquidityIssuer();
    const liquidity = liquidityIssuer.getAmountMath().make;

    // Alice adds liquidity
    const aliceOfferRules = harden({
      offer: {
        TokenA: moola(10000),
        TokenB: simoleans(10000),
      },
      want: { Liquidity: liquidity(0) },
    });
    const alicePayments = harden({
      TokenA: aliceMoolaPayment,
      TokenB: aliceSimoleanPayment,
    });

    const {
      seat: aliceSeat,
      payout: aliceAddLiquidityPayoutP,
    } = await zoe.redeem(aliceInvite, aliceOfferRules, alicePayments);

    const liquidityOk = await aliceSeat.addLiquidity();
    t.equals(liquidityOk, 'Added liquidity.');

    const liquidityPayments = await aliceAddLiquidityPayoutP;
    const liquidityPayout = await liquidityPayments.Liquidity;

    t.deepEquals(
      liquidityIssuer.getAmountOf(liquidityPayout),
      liquidity(10000),
    );
    t.deepEquals(publicAPI.getPoolAmounts(), {
      TokenA: moola(10000),
      TokenB: simoleans(10000),
      Liquidity: liquidity(0),
    });

    // Alice creates an invite for autoswap and sends it to Bob
    const bobInvite = publicAPI.makeInvite();

    // Bob claims it
    const bobExclInvite = await inviteIssuer.claim(bobInvite);
    const bobInviteExtent = inviteIssuer.getAmountOf(bobExclInvite).extent[0];
    const {
      publicAPI: bobAutoswap,
      installationHandle: bobInstallationId,
    } = zoe.getInstance(bobInviteExtent.instanceHandle);
    t.equals(bobInstallationId, installationHandle);

    // Bob looks up the price of 1000 moola in simoleans
    const simoleanAmounts = bobAutoswap.getPrice(
      harden({ TokenA: moola(1000) }),
    );
    t.deepEquals(simoleanAmounts, simoleans(906));

    // Bob escrows
    const bobMoolaForSimOfferRules = harden({
      offer: { TokenA: moola(1000) },
      want: { TokenB: simoleans(0) },
    });
    const bobMoolaForSimPayments = harden({ TokenA: bobMoolaPayment });

    const { seat: bobSeat, payout: bobPayoutP } = await zoe.redeem(
      bobExclInvite,
      bobMoolaForSimOfferRules,
      bobMoolaForSimPayments,
    );

    // Bob swaps
    const offerOk = bobSeat.swap();
    t.equal(offerOk, 'Swap successfully completed.');

    const bobPayout = await bobPayoutP;
    const bobMoolaPayout = await bobPayout.TokenA;
    const bobSimoleanPayout = await bobPayout.TokenB;

    t.deepEqual(moolaR.issuer.getAmountOf(bobMoolaPayout), moola(0));
    t.deepEqual(
      simoleanR.issuer.getAmountOf(bobSimoleanPayout),
      simoleans(906),
    );
    t.deepEquals(bobAutoswap.getPoolAmounts(), {
      TokenA: moola(11000),
      TokenB: simoleans(9094),
      Liquidity: liquidity(0),
    });
  } catch (e) {
    t.assert(false, e);
    console.log(e);
  } finally {
    t.end();
  }
});
