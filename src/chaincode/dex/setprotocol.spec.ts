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
import { GalaChainResponse, GalaChainResponseType, NotFoundError, UnauthorizedError } from "@gala-chain/api";
import { fixture, users, writesMap } from "@gala-chain/test";
import { plainToInstance } from "class-transformer";
import { randomUUID } from "crypto";

import { ConfigureDexFeeAddressDto, DexFeeConfig, SetProtocolFeeDto, SetProtocolFeeResDto } from "../../api";
import { DexV3Contract } from "../DexV3Contract";
import { configureDexFeeAddress, setProtocolFee } from "./setProtocolFee";

describe("Dex Protocol Fee Config Functions", () => {
  it("Should update protocol fee if user is authorized", async () => {
    //Given
    const currentFee = new DexFeeConfig([users.admin.identityKey], 0.2);

    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.admin)
      .caClientIdentity(users.admin.identityKey, "CuratorOrg")
      .savedState(currentFee);
    const dto = new SetProtocolFeeDto(0.5);

    dto.uniqueKey = randomUUID();

    dto.sign(users.admin.privateKey);

    //When
    const res = await contract.SetProtocolFee(ctx, dto);

    //Then
    expect(res).toEqual(GalaChainResponse.Success(new SetProtocolFeeResDto(0.5)));
  });

  it("Should throw error if no fee config is found", async () => {
    //Given
    const { ctx, contract } = fixture(DexV3Contract)
      .caClientIdentity(users.admin.identityKey, "CuratorOrg")
      .registeredUsers(users.admin);

    const dto = new SetProtocolFeeDto(0.5);

    dto.uniqueKey = randomUUID();

    dto.sign(users.admin.privateKey);

    //When
    const res = await contract.SetProtocolFee(ctx, dto);

    //Then
    expect(res).toEqual(
      GalaChainResponse.Error(
        new NotFoundError(
          "Protocol fee configuration has yet to be defined. Dex fee configuration is not defined."
        )
      )
    );
  });
});

describe("Configure Dex Fee Address", () => {
  it("Should throw error if newAuthorities is empty", async () => {
    //Given

    const currentFee = new DexFeeConfig([users.testUser1.identityKey], 0.2);

    const dto = new ConfigureDexFeeAddressDto();
    dto.newAuthorities = [];

    const { ctx, contract } = fixture(DexV3Contract).registeredUsers(users.admin).savedState(currentFee);

    //When
    const res = await contract.ConfigureDexFeeAddress(ctx, dto);

    //Then
    expect(res).toEqual({
      Status: GalaChainResponseType.Error,
      ErrorCode: 400,
      ErrorKey: "DTO_VALIDATION_FAILED",
      ErrorPayload: ["arrayMinSize: At least one user should be defined to provide access"],
      Message:
        "DTO validation failed: (1) arrayMinSize: At least one user should be defined to provide access"
    });
  });

  it("Should throw error if no user is configured to provide access", async () => {
    //Given
    const currentFee = new DexFeeConfig([], 0.2);

    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.admin)
      .caClientIdentity(users.admin.identityKey, "CuratorOrg")
      .savedState(currentFee);

    const dto = new ConfigureDexFeeAddressDto();
    dto.newAuthorities = [users.testUser2.identityKey];

    dto.uniqueKey = randomUUID();
    dto.sign(users.admin.privateKey);

    const res = await contract.ConfigureDexFeeAddress(ctx, dto);

    //Then
    expect(res).toEqual(
      GalaChainResponse.Error(
        new UnauthorizedError(`CallingUser ${users.admin.identityKey} is not authorized to create or update`)
      )
    );
  });

  it("Creates new fee config if none exists and user is curator", async () => {
    //Given
    const dto = new ConfigureDexFeeAddressDto();
    dto.newAuthorities = [users.testUser3.identityKey];

    dto.sign(users.admin.privateKey);

    const { ctx, getWrites } = fixture(DexV3Contract)
      .caClientIdentity(users.admin.identityKey, "CuratorOrg")
      .registeredUsers(users.admin);

    //When
    await configureDexFeeAddress(ctx, dto);

    await ctx.stub.flushWrites();

    const expectedConfig = plainToInstance(DexFeeConfig, {
      authorities: ["client|testUser3"],
      protocolFee: 0.1
    });

    //Then
    expect(getWrites()).toEqual(writesMap(expectedConfig));
  });

  it("Should update authorities if config exists and user is authorized", async () => {
    //Given
    const dexFeeConfig = new DexFeeConfig([users.admin.identityKey]);

    const { ctx, contract, getWrites } = fixture(DexV3Contract)
      .registeredUsers(users.admin)
      .caClientIdentity(users.admin.identityKey, "CuratorOrg")
      .savedState(dexFeeConfig);

    const dto = new ConfigureDexFeeAddressDto();
    dto.newAuthorities = [users.testUser1.identityKey, users.testUser2.identityKey];

    dto.uniqueKey = randomUUID();
    dto.sign(users.admin.privateKey);

    //When
    await contract.ConfigureDexFeeAddress(ctx, dto);

    const expectedConfig = plainToInstance(DexFeeConfig, {
      authorities: ["client|testUser1", "client|testUser2"],
      protocolFee: 0.1
    });

    //Then
    expect(getWrites()).toEqual(writesMap(expectedConfig));
  });

  it("Should throw error if config exists and user is NOT authorized", async () => {
    //Given
    const dexFeeConfig = new DexFeeConfig([users.admin.identityKey]);

    const { ctx, contract } = fixture(DexV3Contract)
      .caClientIdentity(users.admin.identityKey, "CuratorOrg")
      .registeredUsers(users.testUser2)
      .savedState(dexFeeConfig);

    const dto = new ConfigureDexFeeAddressDto();
    dto.newAuthorities = [users.testUser2.identityKey];

    dto.uniqueKey = randomUUID();
    dto.sign(users.testUser2.privateKey);

    //When
    const res = await contract.ConfigureDexFeeAddress(ctx, dto);

    //Then
    expect(res).toEqual(
      GalaChainResponse.Error(
        new UnauthorizedError("CallingUser client|testUser2 is not authorized to create or update")
      )
    );
  });
});
