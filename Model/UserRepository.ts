import * as mongoose from 'mongoose';
import * as crypto from 'crypto';
import * as Repository from 'base-mongodb-repository/build/IRepository';
import { RepositoryQueryCommand } from 'base-mongodb-repository/build/RepositoryQuery';
import { RepositoryQueryResult } from 'base-mongodb-repository/build/RepositoryQueryResult';

import * as Errors from 'base-rest-service-container/build/Common/Exceptions';

import { ApplicationConfig } from 'base-rest-service-container/build/Config/ApplicationConfig';
import { TokenPayload } from 'base-rest-service-container/build/Common/SecurityService';

import * as userprofiles from './AppAndPermissions';


export interface IUserModel extends IUser, mongoose.Document {
    getTokenPayload();
}

// mongoose schema
var schema = new mongoose.Schema(
    {
        username: { type: String, unique: true },
        email: String,
        password: String,
        applications: [String],
        roles: [String]
    }
);

schema.methods.getTokenPayload = function () {
    return new TokenPayload(this.username, 'user', this.applications || [], this.roles || []);
};

const SCHEMA_NAME = 'user';
const COLLECTION_NAME = 'users';

export let UserSchema = mongoose.model<IUserModel>(SCHEMA_NAME, schema, COLLECTION_NAME, true);

// TS interface
export interface IUser {
    username: string;
    password: string;
    email: string;
    applications: string[];
    roles: string[];
}


export class UserRepository extends Repository.Repository<IUserModel> {
    constructor() {
        super(UserSchema);
    }

    public GetByUsername(username: string): Promise.IThenable<IUserModel> {
        let userSearch = this.model.findOne({ 'username': username });

        return new Promise(function (resolve, reject) {
            userSearch.exec(function (err: any, doc: IUserModel) {
                if (err)
                    reject(new Errors.DatabaseError(err));
                else
                    resolve(doc);
            })

        });

    }

    public HandleChangeEmailAddress(command: ChangeEmailAddressCommand): Promise.IThenable<IUserModel> {
        return this.Save(command);
    }

    public HandleChangePassword(command: ChangePasswordCommand): Promise.IThenable<IUserModel> {
        return this.Save(command);
    }

    public static HashPassword(password: string): string {
        return crypto.createHash('sha256').update(password).digest('base64');
    }
}

/**
 * Base class for user commands
 */
export abstract class BaseUserCommand {
    name: string;
    constructor(public user: IUserModel) {

    }

    public static ValidateUsername(username: string) {
        if (username === undefined)
            throw new Errors.MalformedEntityError('Invalid username');
    }

    public static ValidatePassword(password: string) {
        if (password === undefined)
            throw new Errors.MalformedEntityError('Password cannot be empty');
    }

    public static ValidateEmailAddress(email: string) {
        let regex = /^[\w_\-]+\.?[\w_\-]*@[\w_\-]+\.{1}[\w_\-]+/;
        if (!regex.test(email))
            throw new Errors.MalformedEntityError('Email address is in a wrong format');
    }

    public static ValidateRoles(roles: string[]) {


    }

}

export class AddUserCommand extends Repository.BaseAddEntityCommand<IUserModel> {
    constructor(username: string, password: string, password_confirm: string, email: string) {
        let UserModel = mongoose.model<IUserModel>(SCHEMA_NAME)
        let user: IUserModel = new UserModel({ username: username });
        super(user);

        BaseUserCommand.ValidatePassword(password);
        //if (password !== password_confirm)
        //    throw new Errors.MalformedEntityError('Password and password confirm don\'t match');

        user.password = UserRepository.HashPassword(password);

        if (email) {
            BaseUserCommand.ValidateEmailAddress(email);
            user.email = email;
        }

    }
}

export class UpdateUserCommand extends Repository.BaseAddEntityCommand<IUserModel>{
    constructor(user: IUserModel) {
        super(user);
    }
}

export class DeleteUserCommand extends Repository.BaseDeleteEntityCommand<IUserModel> {
    constructor(user: IUserModel) {
        super(user);
        if (user.roles.indexOf('admin') > -1 || user.roles.indexOf('built-in') > -1)
            throw new Errors.NotAuthorizedError('Cannot delete this user');
    }
}

/**
 *  ChangePasswordCommand
 */
export class ChangePasswordCommand extends Repository.BaseSaveEntityCommand<IUserModel> {
    constructor(user: IUserModel, oldpassword: string, password: string, password_confirm: string) {
        super(user);

        BaseUserCommand.ValidatePassword(password);

        if (password !== password_confirm)
            throw new Errors.MalformedEntityError('Passoword and passoword confirm don\'t match');

        if (UserRepository.HashPassword(oldpassword) !== user.password)
            throw new Errors.MalformedEntityError('Old password doesn\'t match');

        user.password = UserRepository.HashPassword(password);

    }
}

/**
 *  ChangeEmailAddressCommand
 * 
 */
export class ChangeEmailAddressCommand extends Repository.BaseSaveEntityCommand<IUserModel> {
    constructor(user: IUserModel, email: string) {
        super(user);

        BaseUserCommand.ValidateEmailAddress(email);
        user.email = email;
    }
}

/**
 * 
 */
export class ChangeUserApplicationsCommand extends Repository.BaseSaveEntityCommand<IUserModel> {
    constructor(user: IUserModel, applications: string[]) {
        super(user);

        if (!applications) throw new Errors.MalformedEntityError('Applications list cannot be undefined.');

        let wrongapps: string[] = [];
        applications.forEach(app => {
            if (userprofiles.ShippingApplications.indexOf(app) < 0)
                wrongapps.push(app);

        });

        if (wrongapps && wrongapps.length)
            throw new Errors.MalformedEntityError(`Wrong application name(s) in list (${wrongapps.join(', ')})`);

        user.applications = applications;
    }
}

export class ChangeUserRolesCommand extends Repository.BaseSaveEntityCommand<IUserModel>{
    constructor(user: IUserModel, roles: string[]) {
        super(user);

        if (!roles) throw new Errors.MalformedEntityError('Roles list cannot be undefined.');

        let wrongroles: string[] = [];
        roles.forEach(role => {
            if (userprofiles.ShippingRoles.indexOf(role) < 0)
                wrongroles.push(role);

        });

        if (wrongroles && wrongroles.length)
            throw new Errors.MalformedEntityError(`Wrong role name(s) in list (${wrongroles.join(', ')})`);

        user.roles = roles;
    }
}

export class AuthenticateUserCommand extends BaseUserCommand {

    constructor(user: IUserModel, password: string) {
        super(user);

        if (user.password !== UserRepository.HashPassword(password))
            throw new Errors.InvalidCredentialErrors();

    }

    public get token(): TokenPayload {
        // sign the tocken
        return this.user.getTokenPayload();
    }

}

export class ResetPassword extends Repository.BaseSaveEntityCommand<IUserModel> {
    constructor(user: IUserModel, password: string, password_confirm: string) {
        super(user);

        if (password !== password_confirm) throw new Errors.MalformedEntityError('Password and password confirm are not the same.');
        BaseUserCommand.ValidatePassword(password);

        user.password = UserRepository.HashPassword(password);
    }
}
