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
import { plainToInstance } from "class-transformer";

import { DexFeePercentageTypes, DexPositionData, DexPositionOwner, Pool } from "../../api";
import { DexV3Contract } from "../DexV3Contract";
import dex from "../test/dex";
import { genTickRange } from "./dexUtils";
import { fetchOrCreateDexPosition, fetchUserPositionInTickRange, getDexPosition } from "./position.helper";

describe("Fetch or Create Dex Position", () => {
  const fee = DexFeePercentageTypes.FEE_0_05_PERCENT;

  const currencyClassKey: TokenClassKey = currency.tokenClassKey();

  const dexClassKey: TokenClassKey = dex.tokenClassKey();

  let pool: Pool;
  beforeEach(() => {
    pool = new Pool(
      dexClassKey.toString(),
      currencyClassKey.toString(),
      dexClassKey,
      currencyClassKey,
      fee,
      new BigNumber("44.71236")
    );
  });

  it("Should fetch users position if exists", async () => {
    //Given
    const positionOwner = new DexPositionOwner(users.testUser1.identityKey, pool.genPoolHash());
    const positionId = "0xb3dc4b5";

    positionOwner.addPosition("-887270:887270", positionId);

    const uniquekey = "dexkey345";

    const { ctx } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .callingUser(users.testUser1)
      .savedState(positionOwner);

    //When
    const res = await fetchOrCreateDexPosition(ctx, pool, -887270, 887270, uniquekey);

    const expectedRes = plainToInstance(DexPositionData, {
      poolHash: pool.genPoolHash(),
      positionId: "65550bd31423b5094e31e82fcc5856afd4c5bc220fbbb9ca7e85bf3352e87408",
      tickUpper: -887270,
      tickLower: 887270,
      liquidity: new BigNumber("0"),
      feeGrowthInside0Last: new BigNumber("0"),
      feeGrowthInside1Last: new BigNumber("0"),
      tokensOwed0: new BigNumber("0"),
      tokensOwed1: new BigNumber("0"),
      token0ClassKey: dexClassKey,
      token1ClassKey: currencyClassKey,
      fee: fee
    });

    //Then
    expect(res).toMatchObject(expectedRes);
  });

  it("Should create new position if none exists", async () => {
    //Given
    const uniquekey = "dexkey123";

    const { ctx } = fixture(DexV3Contract).registeredUsers(users.testUser1).callingUser(users.testUser1);

    //When
    const res = await fetchOrCreateDexPosition(ctx, pool, 76110, 75920, uniquekey);

    const expectedRes = plainToInstance(DexPositionData, {
      poolHash: pool.genPoolHash(),
      positionId: "af0e1d8886f3d76e9a4f969f82338db376a76d6defe3692514a83dd50da8842c",
      tickUpper: 76110,
      tickLower: 75920,
      liquidity: new BigNumber("0"),
      feeGrowthInside0Last: new BigNumber("0"),
      feeGrowthInside1Last: new BigNumber("0"),
      tokensOwed0: new BigNumber("0"),
      tokensOwed1: new BigNumber("0"),
      token0ClassKey: dexClassKey,
      token1ClassKey: currencyClassKey,
      fee: 500
    });

    //Then
    expect(res).toEqual(expectedRes);
  });

  test("Should throw NotFoundError if positionId is invalid for given range", async () => {
    //Given
    const uniquekey = "dexkey345";
    const positionId = "0xb3dc4b5";
    const invalidPostionId = "0xb3d435";

    const positionOwner = new DexPositionOwner(users.testUser1.identityKey, pool.genPoolHash());
    positionOwner.addPosition("-887270:887270", positionId);

    //When
    const { ctx } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .callingUser(users.testUser1)
      .savedState(positionOwner);

    //Then
    expect(fetchOrCreateDexPosition(ctx, pool, -887270, 887270, uniquekey, invalidPostionId)).rejects.toThrow(
      "Cannot find any position with the id 0xb3d435 in the tick range 887270:-887270 that belongs to client|testUser1 in this pool."
    );
  });

  describe("fetchUserPositionInTickRange", () => {
    it("Should fetch and return position if valid range and positionId", async () => {
      //Given
      const positionId = "a3f9b7c2";
      const positionOwner = new DexPositionOwner(users.testUser1.identityKey, pool.genPoolHash());
      positionOwner.addPosition(genTickRange(75920, 76110), positionId);

      const dexPositionData = new DexPositionData(
        pool.genPoolHash(),
        positionId,
        76110,
        75920,
        dexClassKey,
        currencyClassKey,
        fee
      );

      const { ctx } = fixture(DexV3Contract)
        .registeredUsers(users.testUser1)
        .callingUser(users.testUser1)
        .savedState(positionOwner, dexPositionData);

      //When
      const res = await fetchUserPositionInTickRange(ctx, pool.genPoolHash(), 76110, 75920);

      const expectedRes = plainToInstance(DexPositionData, {
        poolHash: pool.genPoolHash(),
        positionId: positionId,
        tickUpper: 76110,
        tickLower: 75920,
        liquidity: new BigNumber("0"),
        feeGrowthInside0Last: new BigNumber("0"),
        feeGrowthInside1Last: new BigNumber("0"),
        tokensOwed0: new BigNumber("0"),
        tokensOwed1: new BigNumber("0"),
        token0ClassKey: dexClassKey,
        token1ClassKey: currencyClassKey,
        fee: 500
      });

      //Then
      expect(res).toEqual(expectedRes);
    });

    it("Should throw NotFoundError if positionId does not match tick range", async () => {
      //Given
      const positionId = "a3f9b7c2";
      const positionOwner = new DexPositionOwner(users.testUser1.identityKey, pool.genPoolHash());
      positionOwner.addPosition(genTickRange(75920, 76110), positionId);

      const dexPositionData = new DexPositionData(
        pool.genPoolHash(),
        positionId,
        76110,
        75920,
        dexClassKey,
        currencyClassKey,
        fee
      );

      const { ctx } = fixture(DexV3Contract)
        .registeredUsers(users.testUser1)
        .callingUser(users.testUser1)
        .savedState(positionOwner, dexPositionData);

      //Then
      expect(fetchUserPositionInTickRange(ctx, pool.genPoolHash(), 75710, 75520)).rejects.toThrow(
        "User doesnt holds any position for the tick range 75520:75710 in this pool."
      );
    });

    it("Should use owner param instead of ctx.callingUser if provided", async () => {
      //Given

      const owner = users.testUser3.identityKey;
      const positionId = "a3f9b7c2";
      const positionOwner = new DexPositionOwner(owner, pool.genPoolHash());
      positionOwner.addPosition(genTickRange(75920, 76110), positionId);

      const dexPositionData = new DexPositionData(
        pool.genPoolHash(),
        positionId,
        76110,
        75920,
        dexClassKey,
        currencyClassKey,
        fee
      );

      const { ctx } = fixture(DexV3Contract)
        .registeredUsers(users.testUser1)
        .callingUser(users.testUser1)
        .savedState(positionOwner, dexPositionData);

      const res = await fetchUserPositionInTickRange(
        ctx,
        pool.genPoolHash(),
        76110,
        75920,
        positionId,
        owner
      );

      const expectedRes = plainToInstance(DexPositionData, {
        poolHash: pool.genPoolHash(),
        positionId: positionId,
        tickUpper: 76110,
        tickLower: 75920,
        liquidity: new BigNumber("0"),
        feeGrowthInside0Last: new BigNumber("0"),
        feeGrowthInside1Last: new BigNumber("0"),
        tokensOwed0: new BigNumber("0"),
        tokensOwed1: new BigNumber("0"),
        token0ClassKey: dexClassKey,
        token1ClassKey: currencyClassKey,
        fee: 500
      });

      //Then
      expect(res).toEqual(expectedRes);
    });
  });

  describe("getDexPosition", () => {
    it("Should fetch DexPositionData by composite key", async () => {
      //Given
      const positionId = "a3f9b7c2";

      const dexPositionData = new DexPositionData(
        pool.genPoolHash(),
        positionId,
        76110,
        75920,
        dexClassKey,
        currencyClassKey,
        fee
      );

      const { ctx } = fixture(DexV3Contract).registeredUsers(users.testUser1).savedState(dexPositionData);

      //When
      const res = await getDexPosition(ctx, pool.genPoolHash(), 76110, 75920, positionId);

      const expectedRes = plainToInstance(DexPositionData, {
        poolHash: pool.genPoolHash(),
        positionId: positionId,
        tickUpper: 76110,
        tickLower: 75920,
        liquidity: new BigNumber("0"),
        feeGrowthInside0Last: new BigNumber("0"),
        feeGrowthInside1Last: new BigNumber("0"),
        tokensOwed0: new BigNumber("0"),
        tokensOwed1: new BigNumber("0"),
        token0ClassKey: dexClassKey,
        token1ClassKey: currencyClassKey,
        fee: 500
      });

      //Then
      expect(res).toEqual(expectedRes);
    });
  });
});
