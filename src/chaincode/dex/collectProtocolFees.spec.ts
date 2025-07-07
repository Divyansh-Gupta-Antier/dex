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
  NotFoundError,
  TokenBalance,
  TokenClass,
  TokenClassKey,
  TokenInstance,
  UnauthorizedError,
  asValidUserAlias
} from "@gala-chain/api";
import { currency, fixture, users, writesMap } from "@gala-chain/test";
import BigNumber from "bignumber.js";
import { plainToInstance } from "class-transformer";
import { randomUUID } from "crypto";

import {
  CollectProtocolFeesDto,
  CollectProtocolFeesResDto,
  DexFeeConfig,
  DexFeePercentageTypes,
  Pool
} from "../../api";
import { DexV3Contract } from "../DexV3Contract";
import dex from "../test/dex";

describe("GetPosition", () => {
  const currencyClass: TokenClass = currency.tokenClass();
  const currencyClassKey: TokenClassKey = currency.tokenClassKey();
  const currencyInstance: TokenInstance = currency.tokenInstance();
  let currencyPoolBal: TokenBalance;
  let currencyUserBalance: TokenBalance;

  const dexClass: TokenClass = dex.tokenClass();
  const dexClassKey: TokenClassKey = dex.tokenClassKey();
  const dexInstance: TokenInstance = dex.tokenInstance();
  let dexPoolBalance: TokenBalance;
  let dexUserBalance: TokenBalance;

  let pool: Pool;
  let dexFeeConfig: DexFeeConfig;

  beforeEach(() => {
    // Given
    const token0 = dexClassKey.toStringKey();
    const token1 = currencyClassKey.toStringKey();
    const fee = DexFeePercentageTypes.FEE_1_PERCENT;
    const initialSqrtPrice = new BigNumber("1");

    pool = new Pool(token0, token1, dexClassKey, currencyClassKey, fee, initialSqrtPrice);
    pool.protocolFeesToken0 = new BigNumber(10);
    pool.protocolFeesToken1 = new BigNumber(10);

    currencyPoolBal = plainToInstance(TokenBalance, {
      ...currency.tokenBalancePlain(),
      owner: pool.getPoolAlias()
    });
    dexPoolBalance = plainToInstance(TokenBalance, {
      ...dex.tokenBalancePlain(),
      owner: pool.getPoolAlias()
    });
    currencyUserBalance = plainToInstance(TokenBalance, {
      ...currency.tokenBalancePlain(),
      owner: asValidUserAlias(users.admin.identityKey),
      quantity: new BigNumber(0)
    });
    dexUserBalance = plainToInstance(TokenBalance, {
      ...dex.tokenBalancePlain(),
      owner: asValidUserAlias(users.admin.identityKey),
      quantity: new BigNumber(0)
    });
    const authorities = [asValidUserAlias(users.admin.identityKey)];
    dexFeeConfig = new DexFeeConfig(authorities, 0.3);
  });

  it("Should transfer dex fee", async () => {
    // Given
    const { ctx, contract, getWrites } = fixture(DexV3Contract)
      .registeredUsers(users.admin)
      .caClientIdentity(users.admin.identityKey, "CuratorOrg")
      .savedState(
        pool,
        dexFeeConfig,
        currencyClass,
        dexClass,
        currencyInstance,
        dexInstance,
        currencyPoolBal,
        dexPoolBalance
      );

    const dto = new CollectProtocolFeesDto(
      dexClassKey,
      currencyClassKey,
      DexFeePercentageTypes.FEE_1_PERCENT,
      asValidUserAlias(users.admin.identityKey)
    );

    dto.uniqueKey = randomUUID();

    dto.sign(users.admin.privateKey);

    pool.protocolFeesToken0 = new BigNumber(0);
    pool.protocolFeesToken1 = new BigNumber(0);
    dexPoolBalance.subtractQuantity(new BigNumber(10), ctx.txUnixTime);
    currencyPoolBal.subtractQuantity(new BigNumber(10), ctx.txUnixTime);
    dexUserBalance.addQuantity(new BigNumber(10));
    currencyUserBalance.addQuantity(new BigNumber(10));

    // When
    const response = await contract.CollectProtocolFees(ctx, dto);

    // Then
    expect(response).toEqual(
      GalaChainResponse.Success(new CollectProtocolFeesResDto(new BigNumber(10), new BigNumber(10)))
    );
    expect(getWrites()).toEqual(
      writesMap(pool, dexPoolBalance, currencyPoolBal, currencyUserBalance, dexUserBalance)
    );
  });

  it("Should throw if DexFeeConfig is not defined", async () => {
    // Given
    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.admin)
      .caClientIdentity(users.admin.identityKey, "CuratorOrg")
      .savedState(
        pool,
        currencyClass,
        dexClass,
        currencyInstance,
        dexInstance,
        currencyPoolBal,
        dexPoolBalance
      ); // no fee config

    const dto = new CollectProtocolFeesDto(
      dexClassKey,
      currencyClassKey,
      DexFeePercentageTypes.FEE_1_PERCENT,
      asValidUserAlias(users.admin.identityKey)
    );

    dto.uniqueKey = randomUUID();

    dto.sign(users.admin.privateKey);

    // When
    const res = await contract.CollectProtocolFees(ctx, dto);

    expect(res).toEqual(
      GalaChainResponse.Error(
        new NotFoundError(
          "Protocol fee configuration has yet to be defined. Platform fee configuration is not defined."
        )
      )
    );
  });

  it("Should throw error if calling user is not authorized", async () => {
    //Given
    dexFeeConfig = new DexFeeConfig([users.testUser1.identityKey], 0.3);

    //Writes
    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.admin)
      .caClientIdentity(users.admin.identityKey, "CuratorOrg")
      .savedState(
        pool,
        dexFeeConfig,
        currencyClass,
        dexClass,
        currencyInstance,
        dexInstance,
        currencyPoolBal,
        dexPoolBalance,
        dexFeeConfig,
        dexFeeConfig
      );

    const dto = new CollectProtocolFeesDto(
      dexClassKey,
      currencyClassKey,
      DexFeePercentageTypes.FEE_1_PERCENT,
      asValidUserAlias(users.admin.identityKey)
    );

    dto.uniqueKey = randomUUID();

    dto.sign(users.admin.privateKey);

    const res = await contract.CollectProtocolFees(ctx, dto);

    expect(res).toEqual(
      GalaChainResponse.Error(
        new UnauthorizedError("CallingUser client|admin is not authorized to create or update")
      )
    );
  });

  it("Should not transfer more than pool balance", async () => {
    // Given
    pool.protocolFeesToken0 = new BigNumber(10000);

    const { ctx, contract, getWrites } = fixture(DexV3Contract)
      .registeredUsers(users.admin)
      .caClientIdentity(users.admin.identityKey, "CuratorOrg")
      .savedState(
        pool,
        dexFeeConfig,
        currencyClass,
        dexClass,
        currencyInstance,
        dexInstance,
        currencyPoolBal,
        dexPoolBalance
      );

    const dto = new CollectProtocolFeesDto(
      dexClassKey,
      currencyClassKey,
      DexFeePercentageTypes.FEE_1_PERCENT,
      asValidUserAlias(users.admin.identityKey)
    );

    dto.uniqueKey = randomUUID();

    dto.sign(users.admin.privateKey);

    pool.protocolFeesToken0 = new BigNumber(9000);
    pool.protocolFeesToken1 = new BigNumber(0);
    dexPoolBalance.subtractQuantity(new BigNumber(1000), ctx.txUnixTime);
    currencyPoolBal.subtractQuantity(new BigNumber(10), ctx.txUnixTime);
    dexUserBalance.addQuantity(new BigNumber(1000));
    currencyUserBalance.addQuantity(new BigNumber(10));

    // When
    const res = await contract.CollectProtocolFees(ctx, dto);

    ctx.stub.flushWrites();

    // Then
    expect(res).toEqual(
      GalaChainResponse.Success(new CollectProtocolFeesResDto(new BigNumber(1000), new BigNumber(10)))
    );
    expect(getWrites()).toEqual(
      writesMap(pool, dexPoolBalance, currencyPoolBal, currencyUserBalance, dexUserBalance)
    );
  });
});
