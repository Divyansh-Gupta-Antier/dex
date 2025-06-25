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
import { currency, fixture, users } from "@gala-chain/test";
import BigNumber from "bignumber.js";
import { plainToInstance } from "class-transformer";
import { randomUUID } from "crypto";

import {
  DexFeePercentageTypes,
  DexPositionData,
  Pool,
  SlippageToleranceExceededError,
  SwapDto,
  TickData
} from "../../api";
import { DexV3Contract } from "../DexV3Contract";
import dex from "../test/dex";
import { GetRemoveLiqEstimationResDto } from "./../../api/types/DexDtos";

describe("Swap Test", () => {
  const fee = DexFeePercentageTypes.FEE_0_05_PERCENT;

  const currencyInstance: TokenInstance = currency.tokenInstance();
  const currencyClassKey: TokenClassKey = currency.tokenClassKey();
  const currencyClass: TokenClass = currency.tokenClass();

  const dexInstance: TokenInstance = dex.tokenInstance();
  const dexClassKey: TokenClassKey = dex.tokenClassKey();
  const dexClass: TokenClass = dex.tokenClass();

  let pool: Pool;
  let dexUserBalance: TokenBalance;
  let dexPoolBalance: TokenBalance;
  let currencyUserBalance: TokenBalance;
  let currencyPoolBalance: TokenBalance;

  beforeEach(() => {
    pool = new Pool(
      dexClassKey.toString(),
      currencyClassKey.toString(),
      dexClassKey,
      currencyClassKey,
      fee,
      new BigNumber("44.71236")
    );

    currencyUserBalance = plainToInstance(TokenBalance, {
      ...currency.tokenBalancePlain(),
      owner: users.testUser1.identityKey
    });

    dexUserBalance = plainToInstance(TokenBalance, {
      ...dex.tokenBalancePlain(),
      owner: users.testUser1.identityKey
    });

    currencyPoolBalance = plainToInstance(TokenBalance, {
      ...currency.tokenBalancePlain(),
      owner: pool.getPoolAlias()
    });

    dexPoolBalance = plainToInstance(TokenBalance, {
      ...dex.tokenBalancePlain(),
      owner: pool.getPoolAlias()
    });
  });

  test("User Should be able to swap tokens || zeroForOne = True", async () => {
    //Given

    const currentSqrtPrice = new BigNumber("44.71236");
    const sqrtPriceLimit = currentSqrtPrice.multipliedBy(0.85);

    const positionData = new DexPositionData(
      pool.genPoolHash(),
      "POSITION-ID",
      887270,
      -887270,
      dexClassKey,
      currencyClassKey,
      fee
    );

    const tickLowerData = new TickData(pool.genPoolHash(), -887270);

    const tickUpperData = new TickData(pool.genPoolHash(), 887270);

    pool.mint(positionData, tickLowerData, tickUpperData, new BigNumber("80000"));

    currencyPoolBalance.addQuantity(new BigNumber("3000"));
    dexPoolBalance.addQuantity(new BigNumber("3000"));

    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(
        currencyClass,
        currencyInstance,
        dexInstance,
        dexClass,
        pool,
        currencyPoolBalance,
        dexPoolBalance,
        dexUserBalance,
        currencyUserBalance
      );

    const dto = new SwapDto(dexClassKey, currencyClassKey, fee, new BigNumber("1.5"), true, sqrtPriceLimit);

    dto.uniqueKey = randomUUID();

    dto.sign(users.testUser1.privateKey);

    //When
    const swapRes = await contract.Swap(ctx, dto);

    //Then
    expect(swapRes.Data).toMatchObject({
      token0: "AUTC",
      token0ImageUrl: "https://app.gala.games/test-image-placeholder-url.png",
      token1: "AUTC",
      token1ImageUrl: "https://app.gala.games/test-image-placeholder-url.png",
      amount0: "1.5000000000",
      amount1: "-2994.7838668809",
      userAddress: "client|testUser1",
      poolHash: pool.genPoolHash(),
      poolAlias: pool.getPoolAlias(),
      poolFee: 500
    });
  });

  test("User Should be able to swap tokens || zeroForOne = False", async () => {
    //Given

    const currentSqrtPrice = new BigNumber("44.71236");
    const sqrtPriceLimit = currentSqrtPrice.multipliedBy(1.2);

    const positionData = new DexPositionData(
      pool.genPoolHash(),
      "POSITION-ID",
      887270,
      -887270,
      dexClassKey,
      currencyClassKey,
      fee
    );

    const tickLowerData = new TickData(pool.genPoolHash(), -887270);

    const tickUpperData = new TickData(pool.genPoolHash(), 887270);

    pool.mint(positionData, tickLowerData, tickUpperData, new BigNumber("80000"));

    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(
        currencyClass,
        currencyInstance,
        dexInstance,
        dexClass,
        pool,
        currencyPoolBalance,
        dexPoolBalance,
        dexUserBalance,
        currencyUserBalance
      );

    const dto = new SwapDto(dexClassKey, currencyClassKey, fee, new BigNumber("1.5"), false, sqrtPriceLimit);

    dto.uniqueKey = randomUUID();

    dto.sign(users.testUser1.privateKey);

    //When
    const swapRes = await contract.Swap(ctx, dto);
    console.log("Swap Response", swapRes);

    //Then
    expect(swapRes.Data).toMatchObject({
      token0: "AUTC",
      token0ImageUrl: "https://app.gala.games/test-image-placeholder-url.png",
      token1: "AUTC",
      token1ImageUrl: "https://app.gala.games/test-image-placeholder-url.png",
      amount0: "-0.0007499265",
      amount1: "1.5000000000",
      userAddress: "client|testUser1",
      poolHash: pool.genPoolHash(),
      poolAlias: pool.getPoolAlias(),
      poolFee: fee
    });
  });

  test("It will revert if square root price limit exceeds pool's squareroot price limit", async () => {
    //Given

    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(currencyClass, currencyInstance, dexInstance, dexClass, pool);

    const currentSqrtPrice = new BigNumber("40.71236");
    const sqrtPriceLimit = currentSqrtPrice.multipliedBy(1.5);

    const dto = new SwapDto(dexClassKey, currencyClassKey, fee, new BigNumber("1.5"), true, sqrtPriceLimit);

    dto.uniqueKey = randomUUID();

    dto.sign(users.testUser1.privateKey);

    //When
    const res = await contract.Swap(ctx, dto);

    //Then
    expect(res).toEqual(
      GalaChainResponse.Error(new SlippageToleranceExceededError("SquareRootPrice Limit Exceeds"))
    );
  });

  test("It will revert if sqrt price is below the base sqrt price limit (0.000000000000000000054212146)", async () => {
    //Given
    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(currencyClass, currencyInstance, dexInstance, dexClass, pool);

    const dto = new SwapDto(
      dexClassKey,
      currencyClassKey,
      fee,
      new BigNumber("1.5"),
      true,
      new BigNumber("0.000000000000000000054212146")
    );

    dto.uniqueKey = randomUUID();

    dto.sign(users.testUser1.privateKey);

    //When
    const res = await contract.Swap(ctx, dto);

    //Then
    expect(res).toEqual(
      GalaChainResponse.Error(new SlippageToleranceExceededError("SquareRootPrice Limit Exceeds"))
    );
  });

  test("It will revert if sqrt price is below the base sqrt price limit (18446051000000000000)", async () => {
    //Given
    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(currencyClass, currencyInstance, dexInstance, dexClass, pool);

    const dto = new SwapDto(
      dexClassKey,
      currencyClassKey,
      fee,
      new BigNumber("1.5"),
      true,
      new BigNumber("18446051000000000000")
    );

    dto.uniqueKey = randomUUID();

    dto.sign(users.testUser1.privateKey);

    //When
    const res = await contract.Swap(ctx, dto);

    //Then
    expect(res).toEqual(
      GalaChainResponse.Error(new SlippageToleranceExceededError("SquareRootPrice Limit Exceeds"))
    );
  });

  test("It will revert if specified amount is O", async () => {
    //Given
    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(currencyClass, currencyInstance, dexInstance, dexClass, pool);

    const dto = new SwapDto(
      dexClassKey,
      currencyClassKey,
      fee,
      new BigNumber("0"),
      true,
      new BigNumber("42.71236")
    );

    dto.uniqueKey = randomUUID();

    dto.sign(users.testUser1.privateKey);

    //When
    const res = await contract.Swap(ctx, dto);

    //Then
    expect(res).toEqual(GalaChainResponse.Error(new ValidationFailedError("Invalid specified amount")));
  });

  test("It will revert if slippage tolerance exceeds", async () => {
    //Given
    currencyPoolBalance.addQuantity(new BigNumber("5000"));

    const currentSqrtPrice = new BigNumber("44.71236");
    const sqrtPriceLimit = currentSqrtPrice.multipliedBy(0.85);

    //Adding liquiidty the pool
    const positionData = new DexPositionData(
      pool.genPoolHash(),
      "POSITION-ID",
      887270,
      -887270,
      dexClassKey,
      currencyClassKey,
      fee
    );

    const tickLowerData = new TickData(pool.genPoolHash(), -887270);

    const tickUpperData = new TickData(pool.genPoolHash(), 887270);

    pool.mint(positionData, tickLowerData, tickUpperData, new BigNumber("80000"));

    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(
        currencyClass,
        currencyInstance,
        dexInstance,
        dexClass,
        pool,
        currencyPoolBalance,
        dexPoolBalance,
        dexUserBalance
      );

    const dto = new SwapDto(dexClassKey, currencyClassKey, fee, new BigNumber("1.5"), true, sqrtPriceLimit);
    dto.amountInMaximum = new BigNumber("1.2");

    dto.uniqueKey = randomUUID();

    dto.sign(users.testUser1.privateKey);

    //When
    const swapRes = await contract.Swap(ctx, dto);

    //Then
    expect(swapRes).toEqual(
      GalaChainResponse.Error(
        new SlippageToleranceExceededError(
          "Slippage tolerance exceeded: maximum allowed tokens (1.2) is less than required amount (1.5)."
        )
      )
    );
  });

  test("It will revert if slippage tolerance exceeds", async () => {
    //Given
    dexUserBalance.addQuantity(new BigNumber("5000"));

    currencyUserBalance.addQuantity(new BigNumber("5000"));

    const currentSqrtPrice = new BigNumber("44.71236");
    const sqrtPriceLimit = currentSqrtPrice.multipliedBy(0.85);

    //Adding liquiidty the pool
    const positionData = new DexPositionData(
      pool.genPoolHash(),
      "POSITION-ID",
      887270,
      -887270,
      dexClassKey,
      currencyClassKey,
      fee
    );

    const tickLowerData = new TickData(pool.genPoolHash(), -887270);

    const tickUpperData = new TickData(pool.genPoolHash(), 887270);

    pool.mint(positionData, tickLowerData, tickUpperData, new BigNumber("80000"));

    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(
        currencyClass,
        currencyInstance,
        dexInstance,
        dexClass,
        pool,
        currencyPoolBalance,
        dexPoolBalance,
        dexUserBalance
      );

    const dto = new SwapDto(dexClassKey, currencyClassKey, fee, new BigNumber("1.5"), true, sqrtPriceLimit);
    dto.amountOutMinimum = new BigNumber("-2997");

    dto.uniqueKey = randomUUID();

    dto.sign(users.testUser1.privateKey);

    //When
    const res = await contract.Swap(ctx, dto);

    //Then
    expect(res).toEqual(
      GalaChainResponse.Error(
        new SlippageToleranceExceededError(
          "Slippage tolerance exceeded: minimum received tokens (-2997) is less than actual received amount (-2994.7838668808669192)."
        )
      )
    );
  });

  test("It will revert if there is not enough liquidity available in the pool", async () => {
    //Given

    const currentSqrtPrice = new BigNumber("44.71236");
    const sqrtPriceLimit = currentSqrtPrice.multipliedBy(1.5);

    //Adding liquiidty the pool
    const positionData = new DexPositionData(
      pool.genPoolHash(),
      "POSITION-ID",
      887270,
      -887270,
      dexClassKey,
      currencyClassKey,
      fee
    );
    const tickLowerData = new TickData(pool.genPoolHash(), -887270);
    const tickUpperData = new TickData(pool.genPoolHash(), 887270);

    pool.mint(positionData, tickLowerData, tickUpperData, new BigNumber("80000"));

    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(
        currencyClass,
        currencyInstance,
        dexInstance,
        dexClass,
        pool,
        currencyPoolBalance,
        dexPoolBalance,
        dexUserBalance
      );

    const dto = new SwapDto(
      dexClassKey,
      currencyClassKey,
      fee,
      new BigNumber("-1250"),
      false,
      sqrtPriceLimit
    );

    dto.uniqueKey = randomUUID();

    dto.sign(users.testUser1.privateKey);

    currencyPoolBalance.subtractQuantity(new BigNumber("500"), ctx.txUnixTime);
    dexPoolBalance.subtractQuantity(new BigNumber("500"), ctx.txUnixTime);

    //When
    const res = await contract.Swap(ctx, dto);

    expect(res).toEqual(GalaChainResponse.Error(new ConflictError("Not enough liquidity available in pool")));
  });

  test("Should throw error if amount specified is Zero", async () => {
    //Given

    const currentSqrtPrice = new BigNumber("44.71236");
    const sqrtPriceLimit = currentSqrtPrice.multipliedBy(1.2);

    const positionData = new DexPositionData(
      pool.genPoolHash(),
      "POSITION-ID",
      887270,
      -887270,
      dexClassKey,
      currencyClassKey,
      fee
    );

    const tickLowerData = new TickData(pool.genPoolHash(), -887270);

    const tickUpperData = new TickData(pool.genPoolHash(), 887270);

    pool.mint(positionData, tickLowerData, tickUpperData, new BigNumber("80000"));

    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(
        currencyClass,
        currencyInstance,
        dexInstance,
        dexClass,
        pool,
        currencyPoolBalance,
        dexPoolBalance,
        dexUserBalance,
        currencyUserBalance
      );

    const dto = new SwapDto(
      dexClassKey,
      currencyClassKey,
      fee,
      new BigNumber("0.0000000001"),
      false,
      sqrtPriceLimit
    );

    dto.uniqueKey = randomUUID();

    dto.sign(users.testUser1.privateKey);

    //When
    const res = await contract.Swap(ctx, dto);
    expect(res).toEqual(GalaChainResponse.Error(new ConflictError("Tokens to be traded cannot be zero.")));
  });
});
