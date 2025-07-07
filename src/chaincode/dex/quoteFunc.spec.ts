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
import {
  ConflictError,
  GalaChainResponse,
  TokenBalance,
  TokenClass,
  TokenClassKey,
  TokenInstance,
  ValidationFailedError
} from "@gala-chain/api";
import { currency, fixture, transactionSuccess, users } from "@gala-chain/test";
import BigNumber from "bignumber.js";
import { plainToInstance } from "class-transformer";

import {
  DexFeePercentageTypes,
  DexPositionData,
  Pool,
  QuoteExactAmountDto,
  QuoteExactAmountResDto,
  TickData
} from "../../api";
import { DexV3Contract } from "../DexV3Contract";
import dex from "../test/dex";

describe("Quote Functions", () => {
  const currencyInstance: TokenInstance = currency.tokenInstance();
  const currencyClass: TokenClass = currency.tokenClass();
  const currencyClassKey: TokenClassKey = currency.tokenClassKey();

  const dexInstance: TokenInstance = dex.tokenInstance();
  const dexClass: TokenClass = dex.tokenClass();
  const dexClassKey: TokenClassKey = dex.tokenClassKey();

  const fee = DexFeePercentageTypes.FEE_0_05_PERCENT;

  let pool: Pool;
  let currencyPoolBalance: TokenBalance;
  let dexPoolBalance: TokenBalance;

  beforeEach(() => {
    pool = new Pool(
      dexClassKey.toString(),
      currencyClassKey.toString(),
      dexClassKey,
      currencyClassKey,
      fee,
      new BigNumber("44.71236")
    );
    currencyPoolBalance = plainToInstance(TokenBalance, {
      ...currency.tokenBalancePlain(),
      owner: pool.getPoolAlias(),
      quantity: new BigNumber("0")
    });

    dexPoolBalance = plainToInstance(TokenBalance, {
      ...dex.tokenBalancePlain(),
      owner: pool.getPoolAlias(),
      quantity: new BigNumber("0")
    });
  });

  it("Should return correct quote for valid input (zeroForOne = True)", async () => {
    //Given
    const positionData = new DexPositionData(
      pool.genPoolHash(),
      "POSITION-ID",
      76110,
      75920,
      dexClassKey,
      currencyClassKey,
      fee
    );

    currencyPoolBalance.addQuantity(new BigNumber("3000"));

    dexPoolBalance.addQuantity(new BigNumber("3000"));

    const tickLowerData = new TickData(pool.genPoolHash(), 75920);

    const tickUpperData = new TickData(pool.genPoolHash(), 76110);

    pool.mint(positionData, tickLowerData, tickUpperData, new BigNumber("75646"));

    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(
        pool,
        dexInstance,
        currencyInstance,
        dexClass,
        currencyClass,
        currencyPoolBalance,
        dexPoolBalance
      );

    const dto = new QuoteExactAmountDto(dexClassKey, currencyClassKey, fee, new BigNumber("1.3"), true);

    //When
    const res = await contract.QuoteExactAmount(ctx, dto);

    const expectedRes = new QuoteExactAmountResDto(
      new BigNumber("1.3"),
      new BigNumber("-2595.6607034497"),
      new BigNumber("44.71236"),
      new BigNumber("44.678046742148299052")
    );

    //Then
    expect(res).toEqual(transactionSuccess(expectedRes));
  });

  test("It will throw error if amount specified is 0", async () => {
    //Given
    const positionData = new DexPositionData(
      pool.genPoolHash(),
      "POSITION-ID",
      76110,
      75920,
      dexClassKey,
      currencyClassKey,
      fee
    );

    const tickLowerData = new TickData(pool.genPoolHash(), 75920);

    const tickUpperData = new TickData(pool.genPoolHash(), 76110);

    pool.mint(positionData, tickLowerData, tickUpperData, new BigNumber("75646"));

    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(
        pool,
        dexInstance,
        currencyInstance,
        dexClass,
        currencyClass,
        currencyPoolBalance,
        dexPoolBalance
      );

    const dto = new QuoteExactAmountDto(dexClassKey, currencyClassKey, fee, new BigNumber("0"), true);

    //When
    const res = await contract.QuoteExactAmount(ctx, dto);

    //Then
    expect(res).toEqual(GalaChainResponse.Error(new ValidationFailedError("Invalid specified amount")));
  });

  it("Should throw error if not enough token0 liquidity", async () => {
    //Given

    const positionData = new DexPositionData(
      pool.genPoolHash(),
      "POSITION-ID",
      76110,
      75920,
      dexClassKey,
      currencyClassKey,
      fee
    );
    const tickLowerData = new TickData(pool.genPoolHash(), 75920);

    const tickUpperData = new TickData(pool.genPoolHash(), 76110);

    pool.mint(positionData, tickLowerData, tickUpperData, new BigNumber("100000"));
    dexPoolBalance.addQuantity(new BigNumber("10"));
    currencyPoolBalance.addQuantity(new BigNumber("100"));

    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(
        pool,
        dexInstance,
        currencyInstance,
        dexClass,
        currencyClass,
        currencyPoolBalance,
        dexPoolBalance,
        positionData,
        tickLowerData,
        tickUpperData
      );

    const dto = new QuoteExactAmountDto(dexClassKey, currencyClassKey, fee, new BigNumber("-3100"), false);

    //When
    const res = await contract.QuoteExactAmount(ctx, dto);

    //Then
    expect(res).toEqual(GalaChainResponse.Error(new ConflictError("Not enough liquidity available in pool")));
  });

  it("Should throw error if not enough token1 liquidity", async () => {
    //Given
    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(
        pool,
        dexInstance,
        currencyInstance,
        dexClass,
        currencyClass,
        currencyPoolBalance,
        dexPoolBalance
      );

    dexPoolBalance.addQuantity(new BigNumber("10"));
    currencyPoolBalance.addQuantity(new BigNumber("10"));

    const dto = new QuoteExactAmountDto(dexClassKey, currencyClassKey, fee, new BigNumber("32000"), true);

    //When
    const res = await contract.QuoteExactAmount(ctx, dto);

    //Then
    expect(res).toEqual(GalaChainResponse.Error(new ConflictError("Not enough liquidity available in pool")));
  });

  it("Should throw error if rounded token amount is zero", async () => {
    //Given
    const positionData = new DexPositionData(
      pool.genPoolHash(),
      "POSITION-ID",
      76110,
      75920,
      dexClassKey,
      currencyClassKey,
      fee
    );

    const tickLowerData = new TickData(pool.genPoolHash(), 75920);
    const tickUpperData = new TickData(pool.genPoolHash(), 76110);

    pool.mint(positionData, tickLowerData, tickUpperData, new BigNumber("100000"));

    dexPoolBalance.addQuantity(new BigNumber("1000"));
    currencyPoolBalance.addQuantity(new BigNumber("1000"));

    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(
        pool,
        dexInstance,
        currencyInstance,
        dexClass,
        currencyClass,
        currencyPoolBalance,
        dexPoolBalance,
        positionData,
        tickLowerData,
        tickUpperData
      );

    // Input amount is small enough to round to 0 after decimal adjustment
    const dto = new QuoteExactAmountDto(
      dexClassKey,
      currencyClassKey,
      fee,
      new BigNumber("0.000000000000000001"), // Small value that rounds to 0
      true
    );

    //When
    const res = await contract.QuoteExactAmount(ctx, dto);

    //Then
    expect(res).toEqual(
      GalaChainResponse.Error(
        new ConflictError("Tokens to be traded cannot be zero but are token0: 0 and token1: 0")
      )
    );
  });
});
