/*
 * Copyright (c) Gala Games Inc. All rights reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { TokenClassKey } from "@gala-chain/api";
import { currency, fixture, users } from "@gala-chain/test";
import BigNumber from "bignumber.js";

import { DexPositionData, Pool, TickData, sqrtPriceToTick } from "../../api";
import { DexV3Contract } from "../DexV3Contract";
import dex from "../test/dex";
import { DexFeePercentageTypes } from "./../../api/types/DexDtos";
import { processSwapSteps } from "./swap.helper";

describe("ProcessSwapSteps", () => {
  const fee = DexFeePercentageTypes.FEE_0_05_PERCENT;

  const currencyClassKey: TokenClassKey = currency.tokenClassKey();

  const dexClassKey: TokenClassKey = dex.tokenClassKey();

  const initialSqrtPrice = new BigNumber("45");
  let pool: Pool;

  beforeEach(() => {
    //Given
    pool = new Pool(
      dexClassKey.toString(),
      currencyClassKey.toString(),
      dexClassKey,
      currencyClassKey,
      DexFeePercentageTypes.FEE_0_05_PERCENT,
      initialSqrtPrice
    );
  });

  it("Should stop when sqrtPriceLimit hit", async () => {
    //Given
    const { ctx } = fixture(DexV3Contract).registeredUsers(users.testUser1);

    const sqrtPriceLimit = new BigNumber("44");

    const state = {
      amountSpecifiedRemaining: new BigNumber("1000"),
      amountCalculated: new BigNumber("0"),
      sqrtPrice: initialSqrtPrice,
      tick: 50000,
      liquidity: new BigNumber("5000"),
      feeGrowthGlobalX: new BigNumber("0"),
      protocolFee: new BigNumber("0")
    };

    //When
    const result = await processSwapSteps(ctx, state, pool, sqrtPriceLimit, true, true);

    //Then
    expect(result.sqrtPrice.isEqualTo(sqrtPriceLimit)).toBe(true);
  });

  it("Should throw error if tick out of bounds", async () => {
    //Given
    const { ctx } = fixture(DexV3Contract).registeredUsers(users.testUser1);

    //When
    const state = {
      amountSpecifiedRemaining: new BigNumber("1000"),
      amountCalculated: new BigNumber("0"),
      sqrtPrice: new BigNumber("45"),
      tick: 9999999, // simulate out-of-bounds
      liquidity: new BigNumber("5000"),
      feeGrowthGlobalX: new BigNumber("0"),
      protocolFee: new BigNumber("0")
    };

    //Then
    await expect(processSwapSteps(ctx, state, pool, new BigNumber("44"), true, true)).rejects.toThrow(
      "Not enough liquidity available in pool"
    );
  });

  it("Should calculate amountIn and amountOut correctly (exactInput = true)", async () => {
    //Given
    const { ctx } = fixture(DexV3Contract).registeredUsers(users.testUser1);

    const state = {
      amountSpecifiedRemaining: new BigNumber("1000"),
      amountCalculated: new BigNumber("0"),
      sqrtPrice: new BigNumber("45"),
      tick: 50000,
      liquidity: new BigNumber("5000"),
      feeGrowthGlobalX: new BigNumber("0"),
      protocolFee: new BigNumber("0")
    };

    //When
    const result = await processSwapSteps(ctx, state, pool, new BigNumber("44"), true, true);

    //Then

    expect(result.sqrtPrice.isEqualTo(new BigNumber("44"))).toBe(true);
    expect(result.amountSpecifiedRemaining.isLessThan(new BigNumber("1000"))).toBe(true);
    expect(result.amountCalculated.isLessThan(0)).toBe(true);
  });

  it("Should calculate amountIn and amountOut correctly (exactInput = false)", async () => {
    //Given
    const { ctx } = fixture(DexV3Contract).registeredUsers(users.testUser1);

    const state = {
      amountSpecifiedRemaining: new BigNumber("1000"),
      amountCalculated: new BigNumber("0"),
      sqrtPrice: new BigNumber("45"),
      tick: 50000,
      liquidity: new BigNumber("5000"),
      feeGrowthGlobalX: new BigNumber("0"),
      protocolFee: new BigNumber("0")
    };

    //When
    const result = await processSwapSteps(ctx, state, pool, new BigNumber("44"), false, false);

    //Then
    expect(result.amountCalculated.isGreaterThan(0)).toBe(true); // positive per exactOutput
    expect(result.amountSpecifiedRemaining.isGreaterThan(0)).toBe(true); // remains positive as logged
    expect(result.sqrtPrice.isEqualTo(new BigNumber("44"))).toBe(true);
  });

  it("Should update tick when crossing tick boundary", async () => {
    //Given
    const { ctx } = fixture(DexV3Contract).registeredUsers(users.testUser1);

    //When
    const dexPositionData = new DexPositionData(
      pool.genPoolHash(),
      "POSITION-ID",
      50000,
      50160,
      dexClassKey,
      currencyClassKey,
      fee
    );
    const tickLowerData = new TickData(pool.genPoolHash(), -500000);
    const tickUpperData = new TickData(pool.genPoolHash(), 501600);

    pool.mint(dexPositionData, tickLowerData, tickUpperData, new BigNumber("5000"));

    const state = {
      amountSpecifiedRemaining: new BigNumber("1000"),
      amountCalculated: new BigNumber("0"),
      sqrtPrice: new BigNumber("45"),
      tick: 50000,
      liquidity: new BigNumber("5000"),
      feeGrowthGlobalX: new BigNumber("0"),
      protocolFee: new BigNumber("0")
    };

    //When
    const result = await processSwapSteps(ctx, state, pool, new BigNumber("44"), true, false);

    //Then
    expect(result.tick).toEqual(51413);
  });
});
