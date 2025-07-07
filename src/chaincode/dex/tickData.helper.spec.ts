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

import { DexFeePercentageTypes, Pool, TickData } from "../../api";
import { DexV3Contract } from "../DexV3Contract";
import dex from "../test/dex";
import { fetchOrCreateTickDataPair } from "./tickData.helper";

describe("Tick Data Helper", () => {
  it("Should create new tick data pair if it does not exists", async () => {
    //Given
    const poolHash = "dummyhash1234567890abcdef";
    const tickLower = 75920;
    const tickUpper = 76110;

    const { ctx } = fixture(DexV3Contract).registeredUsers(users.testUser1);

    //When
    const response = await fetchOrCreateTickDataPair(ctx, poolHash, tickLower, tickUpper);

    const expectedTickUpper = new TickData(poolHash, tickUpper);
    const expectedTickLower = new TickData(poolHash, tickLower);

    //Then
    expect(response).toEqual({
      tickUpperData: expectedTickUpper,
      tickLowerData: expectedTickLower
    });
  });

  it("Should return existing tick data pair if it exists", async () => {
    //Given
    const fee = DexFeePercentageTypes.FEE_0_05_PERCENT;
    const initialSqrtPrice = new BigNumber("44.71236");

    const tickLower = 75920;
    const tickUpper = 76110;

    const currencyClassKey: TokenClassKey = currency.tokenClassKey();
    const dexClassKey: TokenClassKey = dex.tokenClassKey();

    const poolObj = new Pool(
      dexClassKey.toString(),
      currencyClassKey.toString(),
      dexClassKey,
      currencyClassKey,
      fee,
      initialSqrtPrice
    );

    const poolHash = poolObj.genPoolHash();

    const tickLowerData = new TickData(poolObj.genPoolHash(), 75920);

    const tickUpperData = new TickData(poolObj.genPoolHash(), 76110);

    const { ctx } = fixture(DexV3Contract)
      .callingUser(users.testUser1)
      .savedState(tickLowerData, tickUpperData);

    //When
    const response = await fetchOrCreateTickDataPair(ctx, poolHash, 75920, 76110);

    const expectedTickUpper = new TickData(poolHash, tickUpper);
    const expectedTickLower = new TickData(poolHash, tickLower);

    //Then
    expect(response).toEqual({
      tickUpperData: expectedTickUpper,
      tickLowerData: expectedTickLower
    });
  });
});
