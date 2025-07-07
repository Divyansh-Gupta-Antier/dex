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
import { GalaChainResponse, TokenBalance, TokenClass, TokenClassKey, TokenInstance } from "@gala-chain/api";
import { currency, fixture, users } from "@gala-chain/test";
import BigNumber from "bignumber.js";
import { plainToInstance } from "class-transformer";
import { randomUUID } from "crypto";

import {
  BurnEstimateDto,
  DexFeePercentageTypes,
  DexPositionData,
  DexPositionOwner,
  GetRemoveLiqEstimationResDto,
  Pool,
  TickData
} from "../../api";
import { DexV3Contract } from "../DexV3Contract";
import dex from "../test/dex";

describe("Burn Estimate Test", () => {
  const currencyInstance: TokenInstance = currency.tokenInstance();
  const currencyClassKey: TokenClassKey = currency.tokenClassKey();
  const currencyClass: TokenClass = currency.tokenClass();

  const dexInstance: TokenInstance = dex.tokenInstance();
  const dexClassKey: TokenClassKey = dex.tokenClassKey();
  const dexClass: TokenClass = dex.tokenClass();

  const fee = DexFeePercentageTypes.FEE_0_05_PERCENT;

  let pool: Pool;
  let currencyPoolBalance: TokenBalance;
  let dexPoolBalance: TokenBalance;

  beforeEach(() => {
    //Given

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
      owner: pool.getPoolAlias()
    });

    dexPoolBalance = plainToInstance(TokenBalance, {
      ...dex.tokenBalancePlain(),
      owner: pool.getPoolAlias()
    });
  });

  it("Should return correct estimation for valid input", async () => {
    //Given
    const positionOwner = new DexPositionOwner(users.testUser1.identityKey, pool.genPoolHash());
    positionOwner.addPosition("75920:76110", "POSITION-ID");

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
        currencyClass,
        currencyInstance,
        dexInstance,
        dexClass,
        pool,
        positionOwner,
        positionData,
        tickLowerData,
        tickUpperData,
        currencyPoolBalance,
        dexPoolBalance
      );

    const dto = new BurnEstimateDto(
      dexClassKey,
      currencyClassKey,
      fee,
      new BigNumber("350"),
      75920,
      76110,
      users.testUser1.identityKey,
      "POSITION-ID"
    );

    dto.uniqueKey = randomUUID();

    //When
    const res = await contract.GetRemoveLiquidityEstimation(ctx, dto);

    //Then
    expect(res).toEqual(
      GalaChainResponse.Success(new GetRemoveLiqEstimationResDto("0.0395068570", "69.3252566675"))
    );
  });

  it("Should handle zero liquidity amount gracefully", async () => {
    //Given
    const positionOwner = new DexPositionOwner(users.testUser1.identityKey, pool.genPoolHash());
    positionOwner.addPosition("75920:76110", "POSITION-ID");

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

    //Adding Liquidity
    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(
        currencyClass,
        currencyInstance,
        dexInstance,
        dexClass,
        pool,
        positionOwner,
        positionData,
        tickLowerData,
        tickUpperData,
        currencyPoolBalance,
        dexPoolBalance
      );

    const dto = new BurnEstimateDto(
      dexClassKey,
      currencyClassKey,
      fee,
      new BigNumber("0"),
      75920,
      76110,
      users.testUser1.identityKey,
      "POSITION-ID"
    );

    dto.uniqueKey = randomUUID();

    //When
    const res = await contract.GetRemoveLiquidityEstimation(ctx, dto);

    //Then
    expect(res).toEqual(
      GalaChainResponse.Success(new GetRemoveLiqEstimationResDto("0.0000000000", "0.0000000000"))
    );
  });

  it("Should estimate near-zero return values for very small burn amount", async () => {
    //Given
    const positionOwner = new DexPositionOwner(users.testUser1.identityKey, pool.genPoolHash());
    positionOwner.addPosition("75920:76110", "POSITION-ID");

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
        currencyClass,
        currencyInstance,
        dexInstance,
        dexClass,
        pool,
        positionOwner,
        positionData,
        tickLowerData,
        tickUpperData,
        currencyPoolBalance,
        dexPoolBalance
      );

    const dto = new BurnEstimateDto(
      dexClassKey,
      currencyClassKey,
      fee,
      new BigNumber("0.00000001"),
      75920,
      76110,
      users.testUser1.identityKey,
      "POSITION-ID"
    );

    dto.uniqueKey = randomUUID();

    //When
    const res = await contract.GetRemoveLiquidityEstimation(ctx, dto);

    //Then
    expect(res).toEqual(
      GalaChainResponse.Success(new GetRemoveLiqEstimationResDto("0.0000000000", "0.0000000020"))
    );
  });
});
