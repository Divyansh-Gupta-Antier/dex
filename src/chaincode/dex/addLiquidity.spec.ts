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
  GalaChainResponse,
  GalaChainResponseType,
  TokenBalance,
  TokenClass,
  TokenClassKey,
  TokenInstance,
  ValidationFailedError
} from "@gala-chain/api";
import { fixture, transactionSuccess, users } from "@gala-chain/test";
import { currency } from "@gala-chain/test";
import BigNumber from "bignumber.js";
import { plainToInstance } from "class-transformer";
import { randomUUID } from "crypto";

import {
  DexOperationResDto,
  Pool,
  SlippageToleranceExceededError,
  UserBalanceResDto,
  feeAmountTickSpacing,
  sqrtPriceToTick
} from "../../api";
import { AddLiquidityDTO, DexFeePercentageTypes } from "../../api";
import dex from "../test/dex";
import { DexV3Contract } from "./../DexV3Contract";
import { addLiquidity } from "./addLiquidity";

describe("Add Liquidity", () => {
  const currencyInstance: TokenInstance = currency.tokenInstance();
  const currencyClass: TokenClass = currency.tokenClass();
  const currencyClassKey: TokenClassKey = currency.tokenClassKey();

  const dexInstance: TokenInstance = dex.tokenInstance();
  const dexClass: TokenClass = dex.tokenClass();
  const dexClassKey: TokenClassKey = dex.tokenClassKey();

  let dexUserBalance: TokenBalance;
  let currencyUserBalance: TokenBalance;
  const fee = DexFeePercentageTypes.FEE_0_05_PERCENT;

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

    currencyUserBalance = plainToInstance(TokenBalance, {
      ...currency.tokenBalancePlain(),
      owner: users.testUser1.identityKey
    });

    dexUserBalance = plainToInstance(TokenBalance, {
      ...dex.tokenBalancePlain(),
      owner: users.testUser1.identityKey
    });
  });

  it("Should use launchpad address if provided", async () => {
    //Given
    const [ta, tb] = spacedTicksFromPrice(1700, 1900, feeAmountTickSpacing[fee]);

    const currencyLaunchpadBalance: TokenBalance = plainToInstance(TokenBalance, {
      ...currency.tokenBalancePlain(),
      owner: users.testUser2.identityKey
    });

    const dexLaunchpadBalance: TokenBalance = plainToInstance(TokenBalance, {
      ...dex.tokenBalancePlain(),
      owner: users.testUser2.identityKey
    });

    const token0 = new BigNumber("1");
    const token1 = new BigNumber("1");
    const [token0Min, token1Min] = [new BigNumber("0"), new BigNumber("0.995")];

    const dto = new AddLiquidityDTO(
      dexClassKey,
      currencyClassKey,
      fee,
      ta,
      tb,
      token0,
      token1,
      token0Min,
      token1Min,
      undefined
    );
    dto.uniqueKey = randomUUID();
    dto.sign(users.testUser1.privateKey);

    const launchpadAlias = users.testUser2.identityKey;

    //When
    const { ctx, getWrites } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1, users.testUser2)
      .callingUser(users.testUser2)
      .savedState(
        dexClass,
        currencyClass,
        dexInstance,
        currencyInstance,
        pool,
        currencyLaunchpadBalance,
        dexLaunchpadBalance
      );

    // const writes = getWrites();

    const res = await addLiquidity(ctx, dto, launchpadAlias);

    const writes = getWrites();

    console.log("Writes are", writes);
    const expectedResponse = plainToInstance(DexOperationResDto, {
      userBalanceDelta: plainToInstance(UserBalanceResDto, {
        token0Balance: {
          owner: users.testUser2.identityKey,
          collection: "TEST",
          category: "Currency",
          type: "DEX",
          additionalKey: "client:6337024724eec8c292f0118d",
          quantity: new BigNumber("1000"),
          instanceIds: [],
          inUseHolds: [],
          lockedHolds: []
        },
        token1Balance: {
          owner: users.testUser2.identityKey,
          collection: "TEST",
          category: "Currency",
          type: "TEST",
          additionalKey: "none",
          quantity: new BigNumber("999.0000000001"),
          instanceIds: [],
          inUseHolds: [],
          lockedHolds: []
        }
      }),
      amounts: ["0", "0.9999999999"],
      poolHash: pool.genPoolHash(),
      poolAlias: pool.getPoolAlias(),
      poolFee: 500,
      userAddress: users.testUser2.identityKey
    });

    expect(res).toEqual(expectedResponse);
  });

  it("Should throw error while adding liquidity below minimum tick", async () => {
    //Given
    const tickLower = -887280,
      tickUpper = -324340;

    const dto = new AddLiquidityDTO(
      dexClassKey,
      currencyClassKey,
      fee,
      tickLower,
      tickUpper,
      new BigNumber(1),
      new BigNumber(1),
      new BigNumber(1),
      new BigNumber(1),
      undefined
    );
    dto.uniqueKey = randomUUID();

    dto.sign(users.testUser1.privateKey);

    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(dexClass, currencyClass, dexInstance, currencyInstance, pool);

    //When
    const addLiquidityRes = await contract.AddLiquidity(ctx, dto);

    //Then
    expect(addLiquidityRes).toEqual({
      Status: GalaChainResponseType.Error,
      ErrorCode: 400,
      ErrorKey: "DTO_VALIDATION_FAILED",
      ErrorPayload: ["min: tickLower must not be less than -887272"],
      Message: "DTO validation failed: (1) min: tickLower must not be less than -887272"
    });
  });

  it("Should throw error while adding liquidity above maximum tick", async () => {
    //Given

    const tickLower = 76110;
    const tickUpper = 887350;

    const dto = new AddLiquidityDTO(
      dexClassKey,
      currencyClassKey,
      fee,
      tickLower,
      tickUpper,
      new BigNumber(1),
      new BigNumber(1),
      new BigNumber(1),
      new BigNumber(1),
      undefined
    );
    dto.uniqueKey = randomUUID();

    dto.sign(users.testUser1.privateKey);

    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(
        dexClass,
        currencyClass,
        dexInstance,
        currencyInstance,
        pool,
        dexUserBalance,
        currencyUserBalance
      );

    const addLiquidityRes = await contract.AddLiquidity(ctx, dto);

    expect(addLiquidityRes).toEqual({
      Status: GalaChainResponseType.Error,
      ErrorCode: 400,
      ErrorKey: "DTO_VALIDATION_FAILED",
      ErrorPayload: ["max: tickUpper must not be greater than 887272"],
      Message: "DTO validation failed: (1) max: tickUpper must not be greater than 887272"
    });
  });

  it("It should throw error  when tick lower is greater than upper tick", async () => {
    //Given
    const tickLower = 887280;
    const tickUpper = -324340;

    const dto = new AddLiquidityDTO(
      dexClassKey,
      currencyClassKey,
      fee,
      tickLower,
      tickUpper,
      new BigNumber(1),
      new BigNumber(1),
      new BigNumber(1),
      new BigNumber(1),
      undefined
    );
    dto.uniqueKey = randomUUID();

    dto.sign(users.testUser1.privateKey);

    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(
        dexClass,
        currencyClass,
        dexInstance,
        currencyInstance,
        pool,
        dexUserBalance,
        currencyUserBalance
      );

    //When
    const addLiquidityRes = await contract.AddLiquidity(ctx, dto);

    //Then
    expect(addLiquidityRes).toEqual({
      Status: GalaChainResponseType.Error,
      ErrorCode: 400,
      ErrorKey: "DTO_VALIDATION_FAILED",
      ErrorPayload: ["isLessThan: tickLower must be less than tickUpper"],
      Message: "DTO validation failed: (1) isLessThan: tickLower must be less than tickUpper"
    });
  });

  it("Should throw error when ticks are not spaced", async () => {
    //Given
    const tickLower = 887;
    const tickUpper = 32434;

    const dto = new AddLiquidityDTO(
      dexClassKey,
      currencyClassKey,
      fee,
      tickLower,
      tickUpper,
      new BigNumber(1),
      new BigNumber(1),
      new BigNumber(1),
      new BigNumber(1),
      undefined
    );
    dto.uniqueKey = randomUUID();

    dto.sign(users.testUser1.privateKey);

    pool.maxLiquidityPerTick = new BigNumber("19200");

    const { ctx, contract, getWrites } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(
        dexClass,
        currencyClass,
        dexInstance,
        currencyInstance,
        pool,
        dexUserBalance,
        currencyUserBalance
      );

    const writes = getWrites();

    //When
    const addLiquidityRes = await contract.AddLiquidity(ctx, dto);

    //Then
    expect(addLiquidityRes).toEqual(
      GalaChainResponse.Error(new ValidationFailedError("Tick is not spaced 887 10"))
    );

    expect(writes).toEqual({});
  });

  test("Adding liquidity more than max liquidity will throw error", async () => {
    //Given
    const pa = 1700,
      pb = 1900;
    const fee = 500;
    const tickSpacing = feeAmountTickSpacing[fee];
    const [ta, tb] = spacedTicksFromPrice(pa, pb, tickSpacing);
    const slippage = 0.5;
    const token0 = new BigNumber("10"),
      token1 = new BigNumber("10000000000000000000000000000000000000000000");
    const [token0Slipped, token1Slipped] = slippedValue([token0, token1], slippage);

    const dto = new AddLiquidityDTO(
      dexClassKey,
      currencyClassKey,
      fee,
      ta,
      tb,
      token0,
      token1,
      token0Slipped,
      token1Slipped,
      undefined
    );
    dto.uniqueKey = randomUUID();

    dto.sign(users.testUser1.privateKey);

    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(
        dexClass,
        currencyClass,
        dexInstance,
        currencyInstance,
        pool,
        dexUserBalance,
        currencyUserBalance
      );

    //When
    const addLiquidityRes = await contract.AddLiquidity(ctx, dto);

    //Then
    expect(addLiquidityRes).toEqual(
      GalaChainResponse.Error(new ValidationFailedError("liquidity crossed max liquidity"))
    );
  });

  test("Adding liquidity equal to zero will throw an error", async () => {
    //Given
    const pa = 1700,
      pb = 1900;
    const fee = 500;
    const tickSpacing = feeAmountTickSpacing[fee];

    const [ta, tb] = spacedTicksFromPrice(pa, pb, tickSpacing);
    const slippage = 0.5;
    const token0 = new BigNumber("0"),
      token1 = new BigNumber("0");
    const [token0Slipped, token1Slipped] = slippedValue([token0, token1], slippage);

    const dto = new AddLiquidityDTO(
      dexClassKey,
      currencyClassKey,
      fee,
      ta,
      tb,
      token0,
      token1,
      token0Slipped,
      token1Slipped,
      undefined
    );
    dto.uniqueKey = randomUUID();

    dto.sign(users.testUser1.privateKey);

    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(
        dexClass,
        currencyClass,
        dexInstance,
        currencyInstance,
        pool,
        dexUserBalance,
        currencyUserBalance
      );

    //When
    const addLiquidityRes = await contract.AddLiquidity(ctx, dto);

    //Then
    expect(addLiquidityRes).toEqual(GalaChainResponse.Error(new ValidationFailedError("Invalid Liquidity")));
  });

  test("Add liquidity in range 1700 - 1900", async () => {
    //Given
    const tickSpacing = feeAmountTickSpacing[fee];

    const pa = 1700,
      pb = 1900;

    pool.maxLiquidityPerTick = new BigNumber("1917565579412846627735051215301243.08110657663841167978");

    const [ta, tb] = spacedTicksFromPrice(pa, pb, tickSpacing);

    const slippage = 0.5;

    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(
        dexClass,
        currencyClass,
        dexInstance,
        currencyInstance,
        pool,
        dexUserBalance,
        currencyUserBalance
      );

    const AmountForLiquidity = pool.getAmountForLiquidity(new BigNumber("1"), ta, tb, false);

    const token0 = new BigNumber(AmountForLiquidity[0]);
    const token1 = new BigNumber(AmountForLiquidity[1]);

    const [token0Slipped, token1Slipped] = slippedValue([token0, token1], slippage);

    const dto = new AddLiquidityDTO(
      dexClassKey,
      currencyClassKey,
      fee,
      ta,
      tb,
      token0,
      token1,
      token0Slipped,
      token1Slipped,
      undefined
    );
    dto.uniqueKey = randomUUID();

    dto.sign(users.testUser1.privateKey);

    //When
    const res = await contract.AddLiquidity(ctx, dto);

    const expectedResponse = plainToInstance(DexOperationResDto, {
      userBalanceDelta: plainToInstance(UserBalanceResDto, {
        token0Balance: {
          owner: users.testUser1.identityKey,
          collection: "TEST",
          category: "Currency",
          type: "DEX",
          additionalKey: "client:6337024724eec8c292f0118d",
          quantity: new BigNumber("1000"),
          instanceIds: [],
          inUseHolds: [],
          lockedHolds: []
        },
        token1Balance: {
          owner: users.testUser1.identityKey,
          collection: "TEST",
          category: "Currency",
          type: "TEST",
          additionalKey: "none",
          quantity: new BigNumber("999.0000000001"),
          instanceIds: [],
          inUseHolds: [],
          lockedHolds: []
        }
      }),
      amounts: ["0", "0.9999999999"],
      poolHash: pool.genPoolHash(),
      poolAlias: pool.getPoolAlias(),
      poolFee: 500,
      userAddress: users.testUser1.identityKey
    });

    //Then
    expect(res).toEqual(transactionSuccess(expectedResponse));
  });

  test("Slippage Tolerance exceeds", async () => {
    //Given
    const tickSpacing = feeAmountTickSpacing[fee];

    const pa = 1700,
      pb = 1900;

    pool.maxLiquidityPerTick = new BigNumber("1917565579412846627735051215301243.08110657663841167978");

    const [ta, tb] = spacedTicksFromPrice(pa, pb, tickSpacing);

    const slippage = 0.5;

    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(
        dexClass,
        currencyClass,
        dexInstance,
        currencyInstance,
        pool,
        dexUserBalance,
        currencyUserBalance
      );

    const AmountForLiquidity = pool.getAmountForLiquidity(new BigNumber("1"), ta, tb, false);

    const token0 = new BigNumber(AmountForLiquidity[0]);
    const token1 = new BigNumber(AmountForLiquidity[1]);

    const [token0Slipped, token1Slipped] = slippedValue([token0, token1], slippage);

    const dto = new AddLiquidityDTO(
      dexClassKey,
      currencyClassKey,
      fee,
      ta,
      tb,
      token0,
      token1,
      token0Slipped,
      new BigNumber("1.2"),
      undefined
    );
    dto.uniqueKey = randomUUID();

    dto.sign(users.testUser1.privateKey);

    //When
    const res = await contract.AddLiquidity(ctx, dto);

    //Then
    expect(res).toEqual(
      GalaChainResponse.Error(
        new SlippageToleranceExceededError(
          "Slippage tolerance exceeded: expected minimums (amount0 ≥ 0, amount1 ≥ 1.2), but received (amount0 = 0, amount1 = 0.9999999999999999987507130119332)"
        )
      )
    );
  });

  test("Slippage Tolerance exceeds : amout1min is greater than received amount", async () => {
    //Given
    const tickSpacing = feeAmountTickSpacing[fee];

    const pa = 1700,
      pb = 1900;

    pool.maxLiquidityPerTick = new BigNumber("1917565579412846627735051215301243.08110657663841167978");

    const [ta, tb] = spacedTicksFromPrice(pa, pb, tickSpacing);

    const slippage = 0.5;

    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(
        dexClass,
        currencyClass,
        dexInstance,
        currencyInstance,
        pool,
        dexUserBalance,
        currencyUserBalance
      );

    const AmountForLiquidity = pool.getAmountForLiquidity(new BigNumber("1"), ta, tb, false);

    const token0 = new BigNumber(AmountForLiquidity[0]);
    const token1 = new BigNumber(AmountForLiquidity[1]);

    const [token0Slipped, token1Slipped] = slippedValue([token0, token1], slippage);

    const dto = new AddLiquidityDTO(
      dexClassKey,
      currencyClassKey,
      fee,
      ta,
      tb,
      token0,
      token1,
      token0Slipped,
      new BigNumber("1.2"),
      undefined
    );
    dto.uniqueKey = randomUUID();

    dto.sign(users.testUser1.privateKey);

    //When
    const res = await contract.AddLiquidity(ctx, dto);

    //Then
    expect(res).toEqual(
      GalaChainResponse.Error(
        new SlippageToleranceExceededError(
          "Slippage tolerance exceeded: expected minimums (amount0 ≥ 0, amount1 ≥ 1.2), but received (amount0 = 0, amount1 = 0.9999999999999999987507130119332)"
        )
      )
    );
  });

  test("Slippage Tolerance exceeds : amout0min is greater than received amount", async () => {
    //Given
    const tickSpacing = feeAmountTickSpacing[fee];

    const pa = 1700,
      pb = 1900;

    pool.maxLiquidityPerTick = new BigNumber("1917565579412846627735051215301243.08110657663841167978");

    const [ta, tb] = spacedTicksFromPrice(pa, pb, tickSpacing);

    const slippage = 0.5;

    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(
        dexClass,
        currencyClass,
        dexInstance,
        currencyInstance,
        pool,
        dexUserBalance,
        currencyUserBalance
      );

    const AmountForLiquidity = pool.getAmountForLiquidity(new BigNumber("1"), ta, tb, false);

    const token0 = new BigNumber(AmountForLiquidity[0]);
    const token1 = new BigNumber(AmountForLiquidity[1]);

    const [token0Slipped, token1Slipped] = slippedValue([token0, token1], slippage);

    const dto = new AddLiquidityDTO(
      dexClassKey,
      currencyClassKey,
      fee,
      ta,
      tb,
      token0,
      token1,
      token0Slipped,
      new BigNumber("1.2"),
      undefined
    );
    dto.uniqueKey = randomUUID();

    dto.sign(users.testUser1.privateKey);

    //When
    const res = await contract.AddLiquidity(ctx, dto);

    //Then
    expect(res).toEqual(
      GalaChainResponse.Error(
        new SlippageToleranceExceededError(
          "Slippage tolerance exceeded: expected minimums (amount0 ≥ 0, amount1 ≥ 1.2), but received (amount0 = 0, amount1 = 0.9999999999999999987507130119332)"
        )
      )
    );
  });
});

const spacedTicksFromPrice = (pa: number, pb: number, tickSpacing: number) => {
  return [
    Math.ceil(sqrtPriceToTick(new BigNumber(Math.sqrt(pa))) / tickSpacing) * tickSpacing,
    Math.floor(sqrtPriceToTick(new BigNumber(Math.sqrt(pb))) / tickSpacing) * tickSpacing
  ];
};

function slippedValue(val: BigNumber[], slippage: BigNumber | number) {
  if (typeof slippage === "number" || typeof slippage === "string") {
    slippage = new BigNumber(slippage);
  }
  const hundred = new BigNumber(100);
  return val.map((e) => e.multipliedBy(hundred.minus(slippage)).dividedBy(hundred));
}
